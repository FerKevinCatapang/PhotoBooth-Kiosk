package com.photobooth.kiosk.plugins

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Base64
import android.util.Log
import android.view.ViewGroup
import android.widget.FrameLayout
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.jiangdg.ausbc.MultiCameraClient
import com.jiangdg.ausbc.callback.ICameraStateCallBack
import com.jiangdg.ausbc.callback.IPreviewDataCallBack
import com.jiangdg.ausbc.camera.CameraUVC
import com.jiangdg.ausbc.camera.bean.CameraRequest
import com.jiangdg.ausbc.widget.AspectRatioTextureView
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean

private const val TAG = "UvcCameraPlugin"
private const val ACTION_USB_PERMISSION = "com.photobooth.kiosk.USB_PERMISSION"

/**
 * Capacitor plugin: UVC USB camera access for DJI Osmo Action 5 (webcam mode) on Android.
 *
 * JavaScript API exposed as `window.Capacitor.Plugins.UvcCamera.*`:
 *
 *   checkCamera()           -> { connected, deviceName? }
 *   requestPermission()     -> { granted }
 *   startPreview(opts)      -> void   opts: { previewWidth?, previewHeight?, fps? }
 *   stopPreview()           -> void
 *   capture()               -> { dataUrl }  -- JPEG base64 data URL
 *
 * Events (addListener):
 *   'uvcCameraState'        -> { connected: bool, deviceName?: string }
 *   'uvcFrame'              -> { dataUrl: string }  -- streamed at ~fps (default 15)
 */
@CapacitorPlugin(name = "UvcCamera")
class UvcCameraPlugin : Plugin() {

    private var multiCameraClient: MultiCameraClient? = null
    private var uvcCamera: CameraUVC? = null

    // Off-screen TextureView needed by the library -- added as an invisible 1x1 view
    private var offscreenView: AspectRatioTextureView? = null
    private var offscreenContainer: FrameLayout? = null

    private val isPreviewing = AtomicBoolean(false)

    // Frame streaming state
    @Volatile private var targetFps: Int = 15
    @Volatile private var lastFrameTime: Long = 0L
    private val frameIntervalMs get() = 1000L / targetFps

    // Single pending capture: resolved with the very next preview frame
    @Volatile private var pendingCaptureCall: PluginCall? = null

    // -------------------------------------------------------------------------
    // USB hotplug receiver
    // -------------------------------------------------------------------------
    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                    val device = getUsbDevice(intent)
                    if (device != null && isUvcDevice(device)) {
                        Log.d(TAG, "UVC attached: ${device.deviceName}")
                        notifyListeners("uvcCameraState", JSObject()
                            .put("connected", true)
                            .put("deviceName", device.productName ?: device.deviceName))
                    }
                }
                UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                    Log.d(TAG, "USB detached -- stopping preview")
                    activity.runOnUiThread { stopPreviewInternal() }
                    notifyListeners("uvcCameraState", JSObject().put("connected", false))
                }
            }
        }
    }

    override fun load() {
        val filter = IntentFilter().apply {
            addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
            addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(usbReceiver, filter)
        }
    }

    override fun handleOnDestroy() {
        stopPreviewInternal()
        try { context.unregisterReceiver(usbReceiver) } catch (_: Exception) {}
        super.handleOnDestroy()
    }

    // -------------------------------------------------------------------------
    // checkCamera
    // -------------------------------------------------------------------------
    @PluginMethod
    fun checkCamera(call: PluginCall) {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        val uvc = usbManager.deviceList.values.firstOrNull { isUvcDevice(it) }
        val result = JSObject()
        if (uvc != null) {
            result.put("connected", true)
            result.put("deviceName", uvc.productName ?: uvc.deviceName)
            result.put("vendorId", uvc.vendorId)
            result.put("productId", uvc.productId)
            result.put("hasPermission", usbManager.hasPermission(uvc))
        } else {
            result.put("connected", false)
        }
        call.resolve(result)
    }

    // -------------------------------------------------------------------------
    // requestPermission
    // -------------------------------------------------------------------------
    @PluginMethod
    fun requestPermission(call: PluginCall) {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        val uvc = usbManager.deviceList.values.firstOrNull { isUvcDevice(it) }
        if (uvc == null) {
            call.resolve(JSObject().put("granted", false).put("error", "No UVC camera connected"))
            return
        }
        if (usbManager.hasPermission(uvc)) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context, 0,
            Intent(ACTION_USB_PERMISSION),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val permReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (ACTION_USB_PERMISSION == intent.action) {
                    val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                    call.resolve(JSObject().put("granted", granted))
                    ctx.unregisterReceiver(this)
                }
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(permReceiver, IntentFilter(ACTION_USB_PERMISSION), Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(permReceiver, IntentFilter(ACTION_USB_PERMISSION))
        }
        usbManager.requestPermission(uvc, pendingIntent)
    }

    // -------------------------------------------------------------------------
    // startPreview -- open camera, begin emitting 'uvcFrame' events to JS
    // -------------------------------------------------------------------------
    @PluginMethod
    fun startPreview(call: PluginCall) {
        val previewW = call.getInt("previewWidth", 1920)!!
        val previewH = call.getInt("previewHeight", 1080)!!
        targetFps = call.getInt("fps", 15)!!.coerceIn(1, 30)

        activity.runOnUiThread {
            if (isPreviewing.get()) { call.resolve(); return@runOnUiThread }

            val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
            val uvc = usbManager.deviceList.values.firstOrNull { isUvcDevice(it) }
            if (uvc == null || !usbManager.hasPermission(uvc)) {
                call.reject("No permitted UVC camera. Call requestPermission() first.")
                return@runOnUiThread
            }

            // The library needs a TextureView surface; use a tiny off-screen one.
            val rootView = activity.window.decorView as ViewGroup
            val container = FrameLayout(context)
            val offscreen = AspectRatioTextureView(context)
            container.addView(offscreen, FrameLayout.LayoutParams(1, 1))
            rootView.addView(container, FrameLayout.LayoutParams(1, 1))
            offscreenContainer = container
            offscreenView = offscreen

            val client = MultiCameraClient(context, object : MultiCameraClient.IDeviceConnectCallBack {
                override fun onAttachDev(device: UsbDevice?) {}
                override fun onDetachDev(device: UsbDevice?) {
                    activity.runOnUiThread { stopPreviewInternal() }
                }
                override fun onConnectDev(device: UsbDevice?, ctrlBlock: com.serenegiant.usb.USBMonitor.UsbControlBlock?) {}
                override fun onDisConnectDev(device: UsbDevice?, ctrlBlock: com.serenegiant.usb.USBMonitor.UsbControlBlock?) {}
            })
            multiCameraClient = client

            val camera = client.getUsbDeviceList().firstOrNull()
                ?.let { client.openCamera(it, offscreen, makeCameraRequest(previewW, previewH)) as? CameraUVC }

            if (camera == null) {
                call.reject("Failed to open UVC camera")
                cleanupViews()
                client.destroy()
                multiCameraClient = null
                return@runOnUiThread
            }

            camera.addCameraStateListener(object : ICameraStateCallBack {
                override fun onCameraState(
                    self: MultiCameraClient.ICamera,
                    code: ICameraStateCallBack.Code,
                    msg: String?
                ) {
                    Log.d(TAG, "Camera state: $code $msg")
                    if (code == ICameraStateCallBack.Code.ERROR) {
                        stopPreviewInternal()
                        notifyListeners("uvcCameraState", JSObject()
                            .put("connected", false).put("error", msg))
                    }
                }
            })

            camera.addPreviewDataCallBack(object : IPreviewDataCallBack {
                override fun onPreviewData(
                    data: ByteArray?,
                    width: Int,
                    height: Int,
                    format: IPreviewDataCallBack.DataFormat
                ) {
                    if (data == null) return

                    // Pending capture: return this frame directly (full quality)
                    val capCall = pendingCaptureCall
                    if (capCall != null) {
                        pendingCaptureCall = null
                        try {
                            val jpeg = toJpeg(data, width, height, format)
                            val b64 = Base64.encodeToString(jpeg, Base64.NO_WRAP)
                            capCall.resolve(JSObject().put("dataUrl", "data:image/jpeg;base64,$b64"))
                        } catch (e: Exception) {
                            capCall.reject("Capture failed: ${e.message}")
                        }
                        return
                    }

                    // Throttled live-preview stream
                    val now = System.currentTimeMillis()
                    if (now - lastFrameTime < frameIntervalMs) return
                    lastFrameTime = now
                    try {
                        val jpeg = toJpeg(data, width, height, format)
                        val b64 = Base64.encodeToString(jpeg, Base64.NO_WRAP)
                        notifyListeners("uvcFrame", JSObject()
                            .put("dataUrl", "data:image/jpeg;base64,$b64"))
                    } catch (e: Exception) {
                        Log.w(TAG, "Frame encode error: ${e.message}")
                    }
                }
            })

            uvcCamera = camera
            isPreviewing.set(true)
            call.resolve()
        }
    }

    // -------------------------------------------------------------------------
    // stopPreview
    // -------------------------------------------------------------------------
    @PluginMethod
    fun stopPreview(call: PluginCall) {
        activity.runOnUiThread {
            stopPreviewInternal()
            call.resolve()
        }
    }

    // -------------------------------------------------------------------------
    // capture -- resolve with the next raw frame as a JPEG data URL
    // -------------------------------------------------------------------------
    @PluginMethod
    fun capture(call: PluginCall) {
        if (!isPreviewing.get()) {
            call.reject("Preview not active. Call startPreview() first.")
            return
        }
        pendingCaptureCall = call
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    private fun stopPreviewInternal() {
        isPreviewing.set(false)
        pendingCaptureCall?.reject("Preview stopped")
        pendingCaptureCall = null
        try { uvcCamera?.closeCamera() } catch (_: Exception) {}
        try { multiCameraClient?.destroy() } catch (_: Exception) {}
        uvcCamera = null
        multiCameraClient = null
        cleanupViews()
    }

    private fun cleanupViews() {
        offscreenContainer?.let { (it.parent as? ViewGroup)?.removeView(it) }
        offscreenContainer = null
        offscreenView = null
    }

    private fun makeCameraRequest(width: Int, height: Int) = CameraRequest.Builder()
        .setPreviewWidth(width)
        .setPreviewHeight(height)
        .setRenderMode(CameraRequest.RenderMode.OPENGL)
        .setDefaultRotateType(CameraRequest.RotateType.ANGLE_0)
        .setAudioSource(CameraRequest.AudioSource.SOURCE_AUTO)
        .setAspectRatioShow(false)
        .setCaptureRawImage(false)
        .setRawPreviewData(true)
        .create()

    private fun toJpeg(
        data: ByteArray,
        width: Int,
        height: Int,
        format: IPreviewDataCallBack.DataFormat
    ): ByteArray = when (format) {
        IPreviewDataCallBack.DataFormat.JPEG -> data
        IPreviewDataCallBack.DataFormat.NV21 -> {
            val yuv = YuvImage(data, ImageFormat.NV21, width, height, null)
            val out = ByteArrayOutputStream(data.size / 4)
            yuv.compressToJpeg(Rect(0, 0, width, height), 90, out)
            out.toByteArray()
        }
        else -> throw IllegalArgumentException("Unsupported format: $format")
    }

    private fun isUvcDevice(device: UsbDevice): Boolean {
        if (device.deviceClass == 0x0E) return true
        for (i in 0 until device.interfaceCount) {
            if (device.getInterface(i).interfaceClass == 0x0E) return true
        }
        return false
    }

    @Suppress("DEPRECATION")
    private fun getUsbDevice(intent: Intent): UsbDevice? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
        else
            intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
}
