package com.aireader.library

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File
import java.io.FileOutputStream

internal object BookCoverStore {
  fun save(bytes: ByteArray, root: File, token: String): File? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth.toLong() * bounds.outHeight > 16_000_000) return null
    val options = BitmapFactory.Options().apply {
      var sample = 1
      while (bounds.outWidth / sample > 900 || bounds.outHeight / sample > 1400) sample *= 2
      inSampleSize = sample
    }
    val image = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return null
    val target = File(root, "cover-$token.jpg")
    var saved = false
    try {
      FileOutputStream(target).use { stream ->
        if (!image.compress(Bitmap.CompressFormat.JPEG, 85, stream)) return null
        stream.fd.sync()
      }
      saved = true
      return target
    } finally { image.recycle(); if (!saved) target.delete() }
  }
}
