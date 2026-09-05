package com.aireader

import com.aireader.player.NarrationPlayerModule
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class ModelDownloadPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(
    ModelDownloadModule(reactContext),
    NarrationEngineModule(reactContext),
    BookLibraryModule(reactContext),
    NarrationPlayerModule(reactContext),
    StorageBackupModule(reactContext),
  )

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
