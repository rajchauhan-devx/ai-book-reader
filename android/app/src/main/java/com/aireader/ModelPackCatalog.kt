package com.aireader

internal data class ModelArtifact(val path: String, val bytes: Long, val sha256: String)

internal object ModelPackCatalog {
  const val PACK_VERSION = "chatterbox-nano-onnx-1"
  const val SOURCE_REVISION = "19265a0f25b51c723b71e2098f766c95fbb94b29"
  const val SOURCE_ROOT = "https://huggingface.co/owensong/chatterbox-nano-ONNX/resolve/$SOURCE_REVISION"
  const val COMPLETION_MARKER = ".verified"
  const val STORAGE_HEADROOM_BYTES = 256L * 1024L * 1024L

  val artifacts = listOf(
    ModelArtifact("LICENSE", 1_087, "7d6744b52e52960d42c69b29b55b4b9e0b4656cf52569ab710093f7707f7a067"),
    ModelArtifact("NOTICE.md", 246, "8eea800cd6d2d93c2987953aa4706cd2df42f81161da314f1c2fb478d1783f07"),
    ModelArtifact("config.json", 1_206, "31de0e848899a63d26fdaacc4287bd14963d8f028a8af8583767b3f678f3c576"),
    ModelArtifact("generation_config.json", 55, "91d2e5ff0fd172d5e8ac4818ef8bcd9b9ee4f7e562831edc8cc3b3702e64f923"),
    ModelArtifact("preprocessor_config.json", 130, "1c320b2eea5f45678d17d891d51c38467775091dbf26a074635ba5e98ede5950"),
    ModelArtifact("tokenizer.json", 3_562_272, "3f04e34bea22f9144d1a19151154095bc9ce0430bf421304f5797e716288a906"),
    ModelArtifact("tokenizer_config.json", 414, "0d637373c70a54c3c7202c0c12b40ff4f346c329960283f5a88031717d73c66f"),
    ModelArtifact("onnx/conditional_decoder_q4.onnx", 2_179_022, "745faa9c2e2494a81e47f2a72601ac248639fd417ae53d999c5068bc441d1f97"),
    ModelArtifact("onnx/conditional_decoder_q4.onnx_data", 246_397_384, "b5c5317e0b79a1a19dd3d5e2b2091ea06b15716716ab801a54eaeb906c6971ec"),
    ModelArtifact("onnx/embed_tokens_fp16.onnx", 1_520, "019d257243774091d78c2ad91c2c0f61e4e442740cb7b3b00b5a89109417b18d"),
    ModelArtifact("onnx/embed_tokens_fp16.onnx_data", 87_304_704, "bcd7b35ae4f206932e2491cb60b42ebb80f6d8facfdb53ba7d7449ad00a3237b"),
    ModelArtifact("onnx/language_model_q4f16.onnx", 522_078, "8fe9620856d86b8a0235041d7fd2a8a47292da50828044bab5740b246e66e65b"),
    ModelArtifact("onnx/language_model_q4f16.onnx_data", 55_911_658, "8f2fdc616373c9ccaebbf2db3210dc80c860922a672898bca111eb75f6d3abd2"),
    ModelArtifact("onnx/speech_encoder_q4f16.onnx", 1_219_352, "29e249f59eaf95015527588b955e5286c7ee4524e7bb54a2f8d589b838e8aed2"),
    ModelArtifact("onnx/speech_encoder_q4f16.onnx_data", 176_273_652, "55d89bd87fd36be48b2e831c99c2e309d432169119049066f9f22fcfe517798d"),
  )

  val totalBytes: Long = artifacts.sumOf { it.bytes }
}
