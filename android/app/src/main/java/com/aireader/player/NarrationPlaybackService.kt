package com.aireader.player

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle
import com.aireader.ChatterboxOnnxEngine
import com.aireader.MainActivity
import com.aireader.ModelPackCatalog
import com.aireader.ModelPackStore
import com.aireader.PerformanceMode
import com.aireader.SystemTtsEngine
import com.aireader.WavAudio
import com.aireader.library.LibraryDatabase
import com.aireader.narration.AudioCacheStore
import com.aireader.narration.EdgeTtsEngine
import com.aireader.narration.TextNormalizer
import com.aireader.narration.VoiceCatalog
import android.util.Log
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger


data class PlaybackSnapshot(
  val state: String, // "idle", "playing", "paused", "buffering", "ended", "error"
  val bookId: String?,
  val chapterId: String?,
  val bookTitle: String?,
  val chapterTitle: String?,
  val sentenceIndex: Int,
  val totalSentences: Int,
  val positionMs: Long,
  val durationMs: Long,
  val speed: Float,
  val sleepTimerSecondsRemaining: Long,
  val isSleepTimerActive: Boolean,
  val sleepTimerEndOfChapter: Boolean,
  val pagePreparationReady: Int = 0,
  val pagePreparationTotal: Int = 0,
  val errorMessage: String? = null,
  val engineMode: String = "edge-cloud",
  val voiceId: String = "warm",
  val isModelLoaded: Boolean = false,
)

class NarrationPlaybackService : Service() {

  companion object {
    const val CHANNEL_ID = "narration_playback"
    const val NOTIFICATION_ID = 2001
    const val DEFAULT_PAGE_SIZE = 20
    const val PREBUFFER_PAGE_SIZE = 20

    const val ACTION_PLAY = "com.aireader.player.ACTION_PLAY"
    const val ACTION_PAUSE = "com.aireader.player.ACTION_PAUSE"
    const val ACTION_RESUME = "com.aireader.player.ACTION_RESUME"
    const val ACTION_STOP = "com.aireader.player.ACTION_STOP"
    const val ACTION_PREV_SENTENCE = "com.aireader.player.ACTION_PREV_SENTENCE"
    const val ACTION_NEXT_SENTENCE = "com.aireader.player.ACTION_NEXT_SENTENCE"
    const val ACTION_SEEK_SENTENCE = "com.aireader.player.ACTION_SEEK_SENTENCE"
    const val ACTION_SKIP_TIME = "com.aireader.player.ACTION_SKIP_TIME"
    const val ACTION_SET_SPEED = "com.aireader.player.ACTION_SET_SPEED"
    const val ACTION_SET_SLEEP_TIMER = "com.aireader.player.ACTION_SET_SLEEP_TIMER"
    const val ACTION_SET_ENGINE_CONFIG = "com.aireader.player.ACTION_SET_ENGINE_CONFIG"
    const val ACTION_SET_SENTENCE_STYLES = "com.aireader.player.ACTION_SET_SENTENCE_STYLES"

    val sentenceEmotionStyles = java.util.concurrent.ConcurrentHashMap<String, String>()

    @Volatile
    var sentenceCacheInvalidated: Boolean = false

    const val EXTRA_BOOK_ID = "bookId"
    const val EXTRA_CHAPTER_ID = "chapterId"
    const val EXTRA_SENTENCE_INDEX = "sentenceIndex"
    const val EXTRA_VOICE_ID = "voiceId"
    const val EXTRA_EXPRESSION = "expression"
    const val EXTRA_SPEED = "speed"
    const val EXTRA_PAGE_SIZE = "pageSize"
    const val EXTRA_DELTA_MS = "deltaMs"
    const val EXTRA_MINUTES = "minutes"
    const val EXTRA_END_OF_CHAPTER = "endOfChapter"
    const val EXTRA_ENGINE_MODE = "engineMode"
    const val EXTRA_EDGE_VOICE = "edgeVoice"

    @Volatile
    var activeEngineMode: String = "edge-cloud"

    @Volatile
    var activeEdgeVoice: String = "en-US-JennyNeural"

    @Volatile
    var lastErrorMessage: String? = null

    @Volatile
    var isServiceActive: Boolean = false

    @Volatile
    internal var onnxEngineInstance: ChatterboxOnnxEngine? = null

    val isModelLoaded: Boolean
      get() = onnxEngineInstance != null

    fun unloadOnnxEngine() {
      try {
        onnxEngineInstance?.close()
      } catch (_: Exception) {}
      onnxEngineInstance = null
    }

    @Volatile
    var currentSnapshot: PlaybackSnapshot = PlaybackSnapshot(
      state = "idle",
      bookId = null,
      chapterId = null,
      bookTitle = null,
      chapterTitle = null,
      sentenceIndex = 0,
      totalSentences = 0,
      positionMs = 0L,
      durationMs = 0L,
      speed = 1.0f,
      sleepTimerSecondsRemaining = 0L,
      isSleepTimerActive = false,
      sleepTimerEndOfChapter = false,
      pagePreparationReady = 0,
      pagePreparationTotal = 0,
      errorMessage = null,
      engineMode = "edge-cloud",
      voiceId = "warm",
      isModelLoaded = false,
    )
      private set

    var stateListener: ((PlaybackSnapshot) -> Unit)? = null
  }

  private val mainHandler = Handler(Looper.getMainLooper())
  private val executor = Executors.newSingleThreadExecutor()
  private val prebufferExecutor = Executors.newSingleThreadExecutor()
  private val prebufferGeneration = AtomicInteger(0)
  private lateinit var audioManager: AudioManager
  private lateinit var mediaSession: MediaSessionCompat
  private lateinit var cacheStore: AudioCacheStore
  private lateinit var modelStore: ModelPackStore
  private lateinit var systemTts: SystemTtsEngine

  // Dual MediaPlayer pool for gapless hardware hand-off
  private var activePlayer: MediaPlayer? = null
  private var nextPlayer: MediaPlayer? = null
  private var nextPreparedSentenceIndex = -1

  private var onnxEngine: ChatterboxOnnxEngine? = null

  // In-memory sentences cache for active chapter
  private var cachedChapterId: String? = null
  private var cachedSentences: List<com.aireader.library.SentenceEntity> = emptyList()


  // Active track state
  private var currentBookId: String? = null
  private var currentChapterId: String? = null
  private var currentBookTitle: String? = null
  private var currentChapterTitle: String? = null
  private var currentSentenceIndex = 0
  private var totalSentencesInChapter = 0
  private var currentVoiceId = "warm"
  private var currentExpression = "natural"
  private var currentSpeed = 1.0f
  private var currentState = "idle" // idle, playing, paused, buffering, ended
  private var currentPageSize = DEFAULT_PAGE_SIZE
  private var currentPageStartIndex = -1
  private var currentPageEndIndex = -1
  private var pagePreparationReady = 0
  private var pagePreparationTotal = 0
  private var currentEngineMode = activeEngineMode
  private var currentEdgeVoice = activeEdgeVoice

  // Sleep timer state
  private var sleepTimerEndTimeMs = 0L
  private var sleepTimerEndOfChapter = false
  private var isSleepTimerActive = false

  // Audio focus state
  private var hasAudioFocus = false
  private var resumeOnFocusGain = false
  private var audioFocusRequest: AudioFocusRequest? = null

  // Noisy receiver
  private var noisyReceiverRegistered = false
  private val becomingNoisyReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
        pausePlayback()
      }
    }
  }

  // Periodic ticker for playback position and sleep timer
  private val tickerRunnable = object : Runnable {
    override fun run() {
      if (currentState == "playing" || isSleepTimerActive) {
        checkSleepTimer()
        updateSnapshot()
        mainHandler.postDelayed(this, 250)
      }
    }
  }

  override fun onCreate() {
    super.onCreate()
    isServiceActive = true
    audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    cacheStore = AudioCacheStore(applicationContext)
    modelStore = ModelPackStore(applicationContext)
    systemTts = SystemTtsEngine(applicationContext)

    createNotificationChannel()
    setupMediaSession()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent == null) return START_NOT_STICKY

    when (intent.action) {
      ACTION_SET_ENGINE_CONFIG -> {
        val oldMode = currentEngineMode
        val oldEdgeV = currentEdgeVoice
        intent.getStringExtra(EXTRA_ENGINE_MODE)?.let {
          currentEngineMode = it
          activeEngineMode = it
        }
        val edgeV = intent.getStringExtra(EXTRA_EDGE_VOICE) ?: intent.getStringExtra("geminiVoice")
        edgeV?.let {
          currentEdgeVoice = it
          activeEdgeVoice = it
        }
        if (oldMode == "chatterbox-local" && currentEngineMode != "chatterbox-local") {
          try {
            onnxEngine?.close()
          } catch (_: Exception) {}
          onnxEngine = null
          onnxEngineInstance = null
          updateSnapshot()
        }
        if ((oldMode != currentEngineMode || oldEdgeV != currentEdgeVoice) &&
            currentBookId != null && currentChapterId != null) {
          prebufferGeneration.incrementAndGet()
          releasePlayers()
          if (currentState == "playing" || currentState == "buffering") {
            loadAndPlaySentence(currentSentenceIndex)
          }
        }
      }
      ACTION_PLAY -> {
        updateForegroundNotification()
        val bId = intent.getStringExtra(EXTRA_BOOK_ID) ?: return START_NOT_STICKY
        val cId = intent.getStringExtra(EXTRA_CHAPTER_ID) ?: return START_NOT_STICKY
        val sIdx = intent.getIntExtra(EXTRA_SENTENCE_INDEX, 0)
        val vId = intent.getStringExtra(EXTRA_VOICE_ID) ?: currentVoiceId
        val expr = intent.getStringExtra(EXTRA_EXPRESSION) ?: currentExpression
        val spd = intent.getFloatExtra(EXTRA_SPEED, currentSpeed)
        val pSize = intent.getIntExtra(EXTRA_PAGE_SIZE, DEFAULT_PAGE_SIZE)
        currentEngineMode = intent.getStringExtra(EXTRA_ENGINE_MODE) ?: activeEngineMode
        val playEdgeV = intent.getStringExtra(EXTRA_EDGE_VOICE) ?: intent.getStringExtra("geminiVoice")
        if (!playEdgeV.isNullOrBlank()) {
          currentEdgeVoice = playEdgeV
          activeEdgeVoice = playEdgeV
        }
        startPlayback(bId, cId, sIdx, vId, expr, spd, pSize)
      }
      ACTION_PAUSE -> pausePlayback()
      ACTION_RESUME -> resumePlayback()
      ACTION_STOP -> stopPlayback()
      ACTION_PREV_SENTENCE -> navigateSentence(-1)
      ACTION_NEXT_SENTENCE -> navigateSentence(1)
      ACTION_SEEK_SENTENCE -> {
        val target = intent.getIntExtra(EXTRA_SENTENCE_INDEX, currentSentenceIndex)
        seekToSentence(target)
      }
      ACTION_SKIP_TIME -> {
        val deltaMs = intent.getLongExtra(EXTRA_DELTA_MS, 0L)
        skipTime(deltaMs)
      }
      ACTION_SET_SPEED -> {
        val spd = intent.getFloatExtra(EXTRA_SPEED, 1.0f)
        setPlaybackSpeed(spd)
      }
      ACTION_SET_SLEEP_TIMER -> {
        val minutes = intent.getIntExtra(EXTRA_MINUTES, 0)
        val endOfChap = intent.getBooleanExtra(EXTRA_END_OF_CHAPTER, false)
        configureSleepTimer(minutes, endOfChap)
      }
      ACTION_SET_SENTENCE_STYLES -> {
        sentenceCacheInvalidated = true
      }
    }

    return START_STICKY
  }

  override fun onDestroy() {
    isServiceActive = false
    prebufferGeneration.incrementAndGet()
    prebufferExecutor.shutdownNow()
    executor.shutdownNow()
    systemTts.shutdown()
    mainHandler.removeCallbacks(tickerRunnable)
    unregisterNoisyReceiver()
    abandonAudioFocus()
    releasePlayers()
    mediaSession.release()
    try {
      onnxEngine?.close()
    } catch (_: Exception) {}
    onnxEngine = null
    onnxEngineInstance = null
    currentState = "idle"
    updateSnapshot()
    super.onDestroy()
  }

  private fun setupMediaSession() {
    mediaSession = MediaSessionCompat(this, "NarrationPlaybackSession").apply {
      setFlags(
        MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
          MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS,
      )
      setCallback(object : MediaSessionCompat.Callback() {
        override fun onPlay() {
          resumePlayback()
        }
        override fun onPause() {
          pausePlayback()
        }
        override fun onSkipToNext() {
          navigateSentence(1)
        }
        override fun onSkipToPrevious() {
          navigateSentence(-1)
        }
        override fun onFastForward() {
          skipTime(30_000L)
        }
        override fun onRewind() {
          skipTime(-15_000L)
        }
        override fun onSeekTo(pos: Long) {
          activePlayer?.seekTo(pos.toInt())
          updateSnapshot()
        }
        override fun onStop() {
          stopPlayback()
        }
      })
      isActive = true
    }
  }

  private fun startPlayback(
    bookId: String,
    chapterId: String,
    sentenceIndex: Int,
    voiceId: String,
    expression: String,
    speed: Float,
    pageSize: Int = DEFAULT_PAGE_SIZE,
  ) {
    prebufferGeneration.incrementAndGet()
    releasePlayers()
    lastErrorMessage = null
    currentBookId = bookId
    currentChapterId = chapterId
    currentSentenceIndex = sentenceIndex
    currentVoiceId = voiceId
    currentExpression = expression
    currentSpeed = speed
    currentPageSize = pageSize.coerceIn(5, 100)

    executor.execute {
      try {
        val db = LibraryDatabase.get(applicationContext)
        val book = db.libraryDao().getBook(bookId)
        val chapter = db.libraryDao().getChapter(bookId, chapterId)
        val sentences = getChapterSentences(chapterId)

        currentBookTitle = book?.title ?: "Book Narration"
        currentChapterTitle = chapter?.title ?: "Chapter"
        totalSentencesInChapter = sentences.size

        currentPageStartIndex = currentSentenceIndex
        currentPageEndIndex = if (totalSentencesInChapter > 0) {
          (currentPageStartIndex + currentPageSize).coerceAtMost(totalSentencesInChapter)
        } else {
          currentPageStartIndex + currentPageSize
        }

        mainHandler.post {
          requestAudioFocus()
          registerNoisyReceiver()
          prepareAndPlayPage(currentPageStartIndex, currentPageEndIndex, currentSentenceIndex)
        }
      } catch (e: Exception) {
        mainHandler.post {
          currentState = "idle"
          updateSnapshot()
        }
      }
    }
  }

  private fun effectiveVoiceId(voiceId: String = currentVoiceId): String {
    val selectedVoice = VoiceCatalog.findVoice(voiceId)
    val isEdgeMode = currentEngineMode == "edge-cloud" || selectedVoice.engine == "edge"
    return if (isEdgeMode) "edge-$currentEdgeVoice" else selectedVoice.id
  }

  private fun prepareAndPlayPage(pageStart: Int, pageEnd: Int, playFromIndex: Int) {
    val bId = currentBookId ?: return
    val cId = currentChapterId ?: return

    if (playFromIndex < 0 || (totalSentencesInChapter > 0 && playFromIndex >= totalSentencesInChapter)) {
      handleChapterTransition()
      return
    }

    currentPageStartIndex = pageStart
    currentPageEndIndex = pageEnd
    currentSentenceIndex = playFromIndex

    val vId = effectiveVoiceId(currentVoiceId)

    // Check which sentences in [playFromIndex, pageEnd) are missing from cache
    val missingIndices = mutableListOf<Int>()
    for (i in playFromIndex until pageEnd) {
      val cached = cacheStore.findCachedSegment(bId, vId, cId, i)
      if (cached == null || !cacheStore.isValidWav(cached)) {
        missingIndices.add(i)
      }
    }

    // Fast path: If the requested sentence is ALREADY cached, play it immediately with 0 delay!
    val firstFile = cacheStore.findCachedSegment(bId, vId, cId, playFromIndex)
    if (firstFile != null && cacheStore.isValidWav(firstFile)) {
      pagePreparationReady = 0
      pagePreparationTotal = 0
      lastErrorMessage = null
      playSentenceAudio(firstFile, playFromIndex)

      // Pre-buffer any remaining uncached sentences on this page in the background
      if (missingIndices.isNotEmpty()) {
        val currentGen = prebufferGeneration.incrementAndGet()
        val expr = currentExpression
        prebufferExecutor.execute {
          try {
            for (missingIdx in missingIndices) {
              if (prebufferGeneration.get() != currentGen) return@execute
              val synth = synthesizeSentence(
                bId,
                cId,
                missingIdx,
                vId,
                expr,
                isCancelled = { prebufferGeneration.get() != currentGen },
              )
              if (synth == null || !cacheStore.isValidWav(synth)) break
            }
            if (prebufferGeneration.get() == currentGen) {
              prebufferPage(pageEnd, currentPageSize)
            }
          } catch (_: Exception) {}
        }
      } else {
        prebufferPage(pageEnd, currentPageSize)
      }
      return
    }

    // Slow path: playFromIndex needs synthesis. Synthesize it FIRST and play as soon as it's ready!
    val currentGen = prebufferGeneration.incrementAndGet()
    currentState = "buffering"
    pagePreparationTotal = (pageEnd - playFromIndex).coerceAtLeast(missingIndices.size)
    pagePreparationReady = (pagePreparationTotal - missingIndices.size).coerceAtLeast(0)
    updateSnapshot()
    updateForegroundNotification()

    val expr = currentExpression

    prebufferExecutor.execute {
      try {
        // Ensure playFromIndex is synthesized first
        val orderedIndices = if (missingIndices.contains(playFromIndex)) {
          listOf(playFromIndex) + missingIndices.filter { it != playFromIndex }
        } else {
          missingIndices
        }

        var firstPlayed = false
        var firstFailed = false

        for (missingIdx in orderedIndices) {
          if (prebufferGeneration.get() != currentGen) {
            return@execute
          }
          val synth = synthesizeSentence(
            bId,
            cId,
            missingIdx,
            vId,
            expr,
            isCancelled = { prebufferGeneration.get() != currentGen },
          )
          if (synth == null || !cacheStore.isValidWav(synth)) {
            if (missingIdx == playFromIndex) {
              firstFailed = true
              break
            }
            // For subsequent sentences, don't abort immediately if first already playing
            continue
          }

          if (missingIdx == playFromIndex && !firstPlayed) {
            firstPlayed = true
            val readyFile = cacheStore.findCachedSegment(bId, vId, cId, playFromIndex)
            if (readyFile != null && cacheStore.isValidWav(readyFile)) {
              mainHandler.post {
                if (prebufferGeneration.get() == currentGen && currentBookId == bId && currentChapterId == cId) {
                  lastErrorMessage = null
                  playSentenceAudio(readyFile, playFromIndex)
                }
              }
            } else {
              firstFailed = true
              break
            }
          }

          mainHandler.post {
            if (prebufferGeneration.get() == currentGen) {
              pagePreparationReady = (pagePreparationReady + 1).coerceAtMost(pagePreparationTotal)
              updateSnapshot()
              updateForegroundNotification()
            }
          }
        }

        if (firstFailed) {
          mainHandler.post {
            if (prebufferGeneration.get() == currentGen && currentBookId == bId && currentChapterId == cId) {
              currentState = "error"
              if (lastErrorMessage == null) {
                lastErrorMessage = "Audio generation failed for sentence ${playFromIndex + 1}."
              }
              updateSnapshot()
              updateForegroundNotification()
            }
          }
        } else if (prebufferGeneration.get() == currentGen) {
          // Page prebuffering complete, start next page prebuffer
          prebufferPage(pageEnd, currentPageSize)
        }
      } catch (e: Exception) {
        mainHandler.post {
          if (prebufferGeneration.get() == currentGen) {
            currentState = "error"
            lastErrorMessage = e.message ?: "Page preparation encountered an error."
            updateSnapshot()
            updateForegroundNotification()
          }
        }
      }
    }
  }

  private fun loadAndPlaySentence(index: Int) {
    val total = totalSentencesInChapter
    val pageEnd = if (total > 0) {
      (index + currentPageSize).coerceAtMost(total)
    } else {
      index + currentPageSize
    }
    currentPageStartIndex = index
    currentPageEndIndex = pageEnd
    prepareAndPlayPage(currentPageStartIndex, currentPageEndIndex, index)
  }

  private fun playSentenceAudio(file: File, sentenceIndex: Int) {
    try {
      releasePlayers()
      currentSentenceIndex = sentenceIndex
      val player = MediaPlayer().apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build(),
        )
        setDataSource(file.absolutePath)
        setOnPreparedListener { mp ->
          try {
            mp.playbackParams = mp.playbackParams.setSpeed(currentSpeed)
          } catch (_: Exception) { }
          mp.start()
          currentState = "playing"
          pagePreparationReady = 0
          pagePreparationTotal = 0
          updateSnapshot()
          updateForegroundNotification()
          updateMediaSessionPlaybackState()
          mainHandler.removeCallbacks(tickerRunnable)
          mainHandler.post(tickerRunnable)

          // Prepare next sentence for gapless hardware hand-off!
          prepareNextSentence(sentenceIndex + 1)
        }
        setOnCompletionListener {
          handleSentenceTransition(sentenceIndex)
        }
        setOnErrorListener { _, _, _ ->
          currentState = "paused"
          updateSnapshot()
          true
        }
        prepareAsync()
      }
      activePlayer = player
    } catch (e: Exception) {
      currentState = "paused"
      updateSnapshot()
    }
  }

  private fun prepareNextSentence(nextIndex: Int) {
    val bId = currentBookId ?: return
    val cId = currentChapterId ?: return
    val total = totalSentencesInChapter
    if (nextIndex < 0 || (total > 0 && nextIndex >= total)) {
      nextPreparedSentenceIndex = -1
      return
    }

    val cached = cacheStore.findCachedSegment(bId, effectiveVoiceId(currentVoiceId), cId, nextIndex)
    if (cached != null && cacheStore.isValidWav(cached)) {
      try {
        try { nextPlayer?.release() } catch (_: Exception) {}
        val np = MediaPlayer().apply {
          setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_MEDIA)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
              .build(),
          )
          setDataSource(cached.absolutePath)
          setOnPreparedListener { preparedMp ->
            try {
              activePlayer?.setNextMediaPlayer(preparedMp)
              nextPreparedSentenceIndex = nextIndex
            } catch (_: Exception) {
              nextPreparedSentenceIndex = -1
            }
          }
          setOnCompletionListener {
            handleSentenceTransition(nextIndex)
          }
          setOnErrorListener { _, _, _ ->
            nextPreparedSentenceIndex = -1
            true
          }
          prepareAsync()
        }
        nextPlayer = np
      } catch (_: Exception) {
        nextPreparedSentenceIndex = -1
      }
    } else {
      nextPreparedSentenceIndex = -1
    }
  }

  private fun handleSentenceTransition(completedIndex: Int) {
    if (sleepTimerEndOfChapter && completedIndex >= totalSentencesInChapter - 1) {
      stopPlayback()
      return
    }

    val nextIndex = completedIndex + 1
    if (totalSentencesInChapter > 0 && nextIndex >= totalSentencesInChapter) {
      handleChapterTransition()
      return
    }

    val bId = currentBookId ?: return
    val cId = currentChapterId ?: return

    // Case A: Hardware gapless handoff succeeded
    if (nextPreparedSentenceIndex == nextIndex && nextPlayer != null) {
      val oldActive = activePlayer
      activePlayer = nextPlayer
      nextPlayer = null
      nextPreparedSentenceIndex = -1
      try {
        oldActive?.reset()
        oldActive?.release()
      } catch (_: Exception) {}

      try {
        activePlayer?.let {
          it.playbackParams = it.playbackParams.setSpeed(currentSpeed)
        }
      } catch (_: Exception) {}

      currentSentenceIndex = nextIndex
      currentState = "playing"
      pagePreparationReady = 0
      pagePreparationTotal = 0
      updateSnapshot()
      updateForegroundNotification()
      updateMediaSessionPlaybackState()

      prepareNextSentence(nextIndex + 1)
      if (nextIndex >= currentPageEndIndex) {
        val total = totalSentencesInChapter
        currentPageStartIndex = nextIndex
        currentPageEndIndex = if (total > 0) (nextIndex + currentPageSize).coerceAtMost(total) else nextIndex + currentPageSize
        prebufferPage(currentPageEndIndex, currentPageSize)
      }
      return
    }

    // Case B: nextIndex is within current page
    if (nextIndex < currentPageEndIndex) {
      val nextFile = cacheStore.findCachedSegment(bId, effectiveVoiceId(currentVoiceId), cId, nextIndex)
      if (nextFile != null && cacheStore.isValidWav(nextFile)) {
        playSentenceAudio(nextFile, nextIndex)
        return
      } else {
        prepareAndPlayPage(currentPageStartIndex, currentPageEndIndex, nextIndex)
        return
      }
    }

    // Case C: Transition to the NEXT PAGE!
    val newPageStart = nextIndex
    val total = totalSentencesInChapter
    val newPageEnd = if (total > 0) {
      (newPageStart + currentPageSize).coerceAtMost(total)
    } else {
      newPageStart + currentPageSize
    }
    currentPageStartIndex = newPageStart
    currentPageEndIndex = newPageEnd

    val nextFile = cacheStore.findCachedSegment(bId, effectiveVoiceId(currentVoiceId), cId, nextIndex)
    if (nextFile != null && cacheStore.isValidWav(nextFile)) {
      playSentenceAudio(nextFile, nextIndex)
      prebufferPage(newPageEnd, currentPageSize)
    } else {
      prepareAndPlayPage(newPageStart, newPageEnd, nextIndex)
    }
  }

  private fun handleChapterTransition() {
    val bId = currentBookId ?: return
    executor.execute {
      try {
        val db = LibraryDatabase.get(applicationContext)
        val chapters = db.libraryDao().listChapters(bId)
        val currentIdx = chapters.indexOfFirst { it.id == currentChapterId }
        if (currentIdx in 0 until chapters.size - 1) {
          val nextChap = chapters[currentIdx + 1]
          val sentences = getChapterSentences(nextChap.id)
          mainHandler.post {
            currentChapterId = nextChap.id
            currentChapterTitle = nextChap.title
            totalSentencesInChapter = sentences.size
            currentSentenceIndex = 0
            loadAndPlaySentence(0)
          }
        } else {
          // Book finished
          mainHandler.post {
            currentState = "ended"
            updateSnapshot()
            stopForeground(false)
            updateForegroundNotification()
          }
        }
      } catch (_: Exception) {
        mainHandler.post {
          currentState = "ended"
          updateSnapshot()
        }
      }
    }
  }

  private fun prebufferPage(startIndex: Int, count: Int = currentPageSize) {
    val bId = currentBookId ?: return
    val cId = currentChapterId ?: return
    val vId = effectiveVoiceId(currentVoiceId)
    val expr = currentExpression
    val total = totalSentencesInChapter
    if (total <= 0) return

    val targetEnd = (startIndex + count).coerceAtMost(total)
    if (startIndex >= targetEnd) return

    val currentGen = prebufferGeneration.get()

    prebufferExecutor.execute {
      try {
        for (i in startIndex until targetEnd) {
          if (prebufferGeneration.get() != currentGen) {
            break
          }
          val cached = cacheStore.findCachedSegment(bId, vId, cId, i)
          if (cached == null || !cacheStore.isValidWav(cached)) {
            val synth = synthesizeSentence(
              bId,
              cId,
              i,
              vId,
              expr,
              isCancelled = { prebufferGeneration.get() != currentGen },
            )
            if (synth == null) {
              break
            }
          }
        }
      } catch (_: Exception) { }
    }
  }

  private fun getChapterSentences(chapterId: String): List<com.aireader.library.SentenceEntity> {
    if (!sentenceCacheInvalidated && cachedChapterId == chapterId && cachedSentences.isNotEmpty()) {
      return cachedSentences
    }
    sentenceCacheInvalidated = false
    val db = LibraryDatabase.get(applicationContext)
    val list = db.libraryDao().chapterSentences(chapterId)
    cachedChapterId = chapterId
    cachedSentences = list
    return list
  }

  private fun synthesizeSentence(
    bookId: String,
    chapterId: String,
    sentenceIndex: Int,
    voiceId: String,
    expression: String,
    isCancelled: () -> Boolean = { false },
  ): File? {
    if (isCancelled()) return null

    val sentences = getChapterSentences(chapterId)
    if (sentenceIndex < 0 || sentenceIndex >= sentences.size) return null

    val sentence = sentences[sentenceIndex]
    val rawText = if (sentence.normalizedText.isNotBlank()) {
      sentence.normalizedText
    } else {
      sentence.text
    }
    val normalized = TextNormalizer.normalize(rawText)
    if (normalized.isBlank()) return null

    if (isCancelled()) return null

    val styleKey = "${chapterId}:${sentenceIndex}"
    val dynamicEmotion = sentenceEmotionStyles[styleKey] ?: sentenceEmotionStyles[sentenceIndex.toString()]
    val effectiveExpression = dynamicEmotion ?: expression

    val selectedVoice = VoiceCatalog.findVoice(voiceId)
    val selectedExpr = VoiceCatalog.findExpression(effectiveExpression)

    val isEdgeMode = currentEngineMode == "edge-cloud" || selectedVoice.engine == "edge"
    val effectiveVoiceId = if (isEdgeMode) "edge-$currentEdgeVoice" else selectedVoice.id

    val cacheKey = cacheStore.computeCacheKey(
      normalizedText = normalized,
      modelPackId = if (isEdgeMode) "edge-neural" else "chatterbox-nano",
      modelVersion = if (isEdgeMode) currentEdgeVoice else ModelPackCatalog.PACK_VERSION,
      voiceId = effectiveVoiceId,
      expression = effectiveExpression,
    )
    val targetFile = cacheStore.segmentFile(bookId, effectiveVoiceId, chapterId, sentenceIndex, cacheKey)
    if (cacheStore.isValidWav(targetFile)) return targetFile

    targetFile.parentFile?.mkdirs()

    if (isCancelled()) return null

    // Mode 1: Microsoft Edge Neural Cloud AI
    if (isEdgeMode) {
      val res = EdgeTtsEngine.synthesize(
        text = normalized,
        voiceName = currentEdgeVoice,
        targetFile = targetFile,
        emotionStyle = effectiveExpression,
      )
      if (res.isSuccess && cacheStore.isValidWav(targetFile)) {
        lastErrorMessage = null
        return targetFile
      }
      val err = res.exceptionOrNull()?.message ?: "Edge TTS synthesis failed"
      lastErrorMessage = "Microsoft Edge Neural error: $err"
      Log.e("NarrationPlaybackService", "Edge TTS failed: $lastErrorMessage")
      return null
    }

    // Mode 2: Chatterbox Local On-Device AI
    if (!modelStore.isInstalled()) {
      lastErrorMessage = "Chatterbox neural model pack is not installed. Download it in Model Setup."
      return null
    }

    try {
      var refFile = File(applicationContext.filesDir, selectedVoice.referenceAsset ?: "voice/neutral-reference.wav")
      if (!refFile.exists() || refFile.length() < 44) {
        val fallbackRef = File(applicationContext.filesDir, "voice/neutral-reference.wav")
        if (fallbackRef.exists() && fallbackRef.length() >= 44) {
          refFile = fallbackRef
        } else {
          try {
            systemTts.synthesizeReference(refFile)
          } catch (_: Exception) {}
          if (!refFile.exists() || refFile.length() < 44) {
            if (fallbackRef.exists()) refFile = fallbackRef
          }
        }
      }
      val reference = WavAudio.readMono(refFile)
      val naturalEngine = onnxEngine ?: ChatterboxOnnxEngine(modelStore).also {
        onnxEngine = it
        onnxEngineInstance = it
        mainHandler.post { updateSnapshot() }
      }
      val generated = naturalEngine.generate(
        text = normalized,
        reference = reference,
        performanceMode = PerformanceMode.BALANCED,
        isCancelled = isCancelled,
        onProgress = { _, _ -> },
      )
      if (isCancelled()) return null
      WavAudio.writeMonoPcm16(targetFile, generated.samples)
      if (cacheStore.isValidWav(targetFile)) {
        return targetFile
      } else {
        lastErrorMessage = "Chatterbox generation produced invalid audio."
        return null
      }
    } catch (e: Exception) {
      Log.e("NarrationPlaybackService", "Chatterbox generation failed: ${e.message}", e)
      lastErrorMessage = "Chatterbox engine error: ${e.message}"
      return null
    }
  }

  private fun pausePlayback() {
    activePlayer?.let {
      if (it.isPlaying) {
        it.pause()
      }
    }
    currentState = "paused"
    updateSnapshot()
    updateForegroundNotification()
    updateMediaSessionPlaybackState()
  }

  private fun resumePlayback() {
    if (currentState == "paused" && activePlayer != null) {
      requestAudioFocus()
      registerNoisyReceiver()
      activePlayer?.start()
      currentState = "playing"
      updateSnapshot()
      updateForegroundNotification()
      updateMediaSessionPlaybackState()
      mainHandler.removeCallbacks(tickerRunnable)
      mainHandler.post(tickerRunnable)
    } else if (currentBookId != null && currentChapterId != null) {
      loadAndPlaySentence(currentSentenceIndex)
    }
  }

  private fun stopPlayback() {
    releasePlayers()
    prebufferGeneration.incrementAndGet()
    try {
      onnxEngine?.close()
    } catch (_: Exception) {}
    onnxEngine = null
    onnxEngineInstance = null
    currentState = "idle"
    isSleepTimerActive = false
    sleepTimerEndTimeMs = 0L
    sleepTimerEndOfChapter = false
    updateSnapshot()
    updateMediaSessionPlaybackState()
    stopForeground(true)
    stopSelf()
  }

  private fun navigateSentence(direction: Int) {
    val nextIndex = currentSentenceIndex + direction
    if (nextIndex in 0 until totalSentencesInChapter) {
      prebufferGeneration.incrementAndGet()
      releasePlayers()
      loadAndPlaySentence(nextIndex)
    }
  }

  private fun seekToSentence(index: Int) {
    if (index in 0 until totalSentencesInChapter) {
      prebufferGeneration.incrementAndGet()
      releasePlayers()
      loadAndPlaySentence(index)
    }
  }

  private fun skipTime(deltaMs: Long) {
    val player = activePlayer ?: return
    val currentPos = player.currentPosition
    val duration = player.duration
    val targetPos = currentPos + deltaMs

    if (targetPos < 0) {
      // Go to previous sentence
      navigateSentence(-1)
    } else if (targetPos >= duration) {
      // Advance to next sentence
      navigateSentence(1)
    } else {
      player.seekTo(targetPos.toInt())
      updateSnapshot()
    }
  }

  private fun setPlaybackSpeed(speed: Float) {
    currentSpeed = speed.coerceIn(0.75f, 2.0f)
    activePlayer?.let {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          it.playbackParams = it.playbackParams.setSpeed(currentSpeed)
        }
      } catch (_: Exception) { }
    }
    nextPlayer?.let {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          it.playbackParams = it.playbackParams.setSpeed(currentSpeed)
        }
      } catch (_: Exception) { }
    }
    updateSnapshot()
  }

  private fun configureSleepTimer(minutes: Int, endOfChapter: Boolean) {
    sleepTimerEndOfChapter = endOfChapter
    if (endOfChapter) {
      isSleepTimerActive = true
      sleepTimerEndTimeMs = 0L
    } else if (minutes > 0) {
      isSleepTimerActive = true
      sleepTimerEndTimeMs = System.currentTimeMillis() + minutes * 60_000L
    } else {
      isSleepTimerActive = false
      sleepTimerEndTimeMs = 0L
      // restore volume in case fade began
      activePlayer?.setVolume(1.0f, 1.0f)
    }
    updateSnapshot()
  }

  private fun checkSleepTimer() {
    if (!isSleepTimerActive || sleepTimerEndOfChapter) return

    val remainingMs = sleepTimerEndTimeMs - System.currentTimeMillis()
    if (remainingMs <= 0) {
      isSleepTimerActive = false
      sleepTimerEndTimeMs = 0L
      activePlayer?.setVolume(1.0f, 1.0f)
      pausePlayback()
    } else if (remainingMs <= 5_000L) {
      // Smooth fade-out in final 5 seconds
      val fade = (remainingMs.toFloat() / 5_000L).coerceIn(0.05f, 1.0f)
      activePlayer?.setVolume(fade, fade)
    }
  }

  private fun updateSnapshot() {
    val player = activePlayer
    val pos = if (player != null && (currentState == "playing" || currentState == "paused")) {
      player.currentPosition.toLong()
    } else 0L

    val dur = if (player != null && (currentState == "playing" || currentState == "paused")) {
      player.duration.toLong()
    } else 0L

    val remainingSec = if (isSleepTimerActive && !sleepTimerEndOfChapter && sleepTimerEndTimeMs > 0L) {
      ((sleepTimerEndTimeMs - System.currentTimeMillis()) / 1000L).coerceAtLeast(0L)
    } else 0L

    val snapshot = PlaybackSnapshot(
      state = currentState,
      bookId = currentBookId,
      chapterId = currentChapterId,
      bookTitle = currentBookTitle,
      chapterTitle = currentChapterTitle,
      sentenceIndex = currentSentenceIndex,
      totalSentences = totalSentencesInChapter,
      positionMs = pos,
      durationMs = dur,
      speed = currentSpeed,
      sleepTimerSecondsRemaining = remainingSec,
      isSleepTimerActive = isSleepTimerActive,
      sleepTimerEndOfChapter = sleepTimerEndOfChapter,
      pagePreparationReady = pagePreparationReady,
      pagePreparationTotal = pagePreparationTotal,
      errorMessage = lastErrorMessage,
      engineMode = currentEngineMode,
      voiceId = currentVoiceId,
      isModelLoaded = onnxEngine != null,
    )
    currentSnapshot = snapshot
    stateListener?.invoke(snapshot)
  }

  private fun updateMediaSessionPlaybackState() {
    val stateCode = when (currentState) {
      "playing" -> PlaybackStateCompat.STATE_PLAYING
      "paused" -> PlaybackStateCompat.STATE_PAUSED
      "buffering" -> PlaybackStateCompat.STATE_BUFFERING
      "error" -> PlaybackStateCompat.STATE_ERROR
      else -> PlaybackStateCompat.STATE_NONE
    }

    val playbackState = PlaybackStateCompat.Builder()
      .setActions(
        PlaybackStateCompat.ACTION_PLAY or
          PlaybackStateCompat.ACTION_PAUSE or
          PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
          PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
          PlaybackStateCompat.ACTION_FAST_FORWARD or
          PlaybackStateCompat.ACTION_REWIND or
          PlaybackStateCompat.ACTION_SEEK_TO or
          PlaybackStateCompat.ACTION_STOP,
      )
      .setState(
        stateCode,
        activePlayer?.currentPosition?.toLong() ?: 0L,
        if (currentState == "playing") currentSpeed else 0f,
      )
      .build()

    mediaSession.setPlaybackState(playbackState)

    val metadata = MediaMetadataCompat.Builder()
      .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentChapterTitle ?: "Chapter")
      .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentBookTitle ?: "AI Book Reader")
      .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, activePlayer?.duration?.toLong() ?: 0L)
      .build()

    mediaSession.setMetadata(metadata)
  }

  private fun updateForegroundNotification() {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun buildNotification(): Notification {
    val openAppIntent = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      },
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    val prevIntent = PendingIntent.getService(
      this,
      1,
      Intent(this, NarrationPlaybackService::class.java).apply { action = ACTION_PREV_SENTENCE },
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    val rewIntent = PendingIntent.getService(
      this,
      2,
      Intent(this, NarrationPlaybackService::class.java).apply {
        action = ACTION_SKIP_TIME
        putExtra(EXTRA_DELTA_MS, -15_000L)
      },
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    val playPauseAction = if (currentState == "playing") ACTION_PAUSE else ACTION_RESUME
    val playPauseIcon = if (currentState == "playing") {
      android.R.drawable.ic_media_pause
    } else {
      android.R.drawable.ic_media_play
    }
    val playPauseIntent = PendingIntent.getService(
      this,
      3,
      Intent(this, NarrationPlaybackService::class.java).apply { action = playPauseAction },
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    val ffIntent = PendingIntent.getService(
      this,
      4,
      Intent(this, NarrationPlaybackService::class.java).apply {
        action = ACTION_SKIP_TIME
        putExtra(EXTRA_DELTA_MS, 30_000L)
      },
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    val nextIntent = PendingIntent.getService(
      this,
      5,
      Intent(this, NarrationPlaybackService::class.java).apply { action = ACTION_NEXT_SENTENCE },
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    val subtitle = when (currentState) {
      "buffering" -> if (pagePreparationTotal > 0) "Preparing page ($pagePreparationReady/$pagePreparationTotal)…" else "Preparing narration…"
      "error" -> lastErrorMessage ?: "Narration error"
      else -> "Sentence ${currentSentenceIndex + 1} of $totalSentencesInChapter"
    }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(currentChapterTitle ?: "AI Book Reader")
      .setContentText("${currentBookTitle ?: ""} · $subtitle")
      .setSubText(currentBookTitle)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentIntent(openAppIntent)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(currentState == "playing" || currentState == "buffering")
      .addAction(android.R.drawable.ic_media_previous, "Previous", prevIntent)
      .addAction(android.R.drawable.ic_media_rew, "-15s", rewIntent)
      .addAction(playPauseIcon, if (currentState == "playing") "Pause" else "Play", playPauseIntent)
      .addAction(android.R.drawable.ic_media_ff, "+30s", ffIntent)
      .addAction(android.R.drawable.ic_media_next, "Next", nextIntent)
      .setStyle(
        MediaStyle()
          .setMediaSession(mediaSession.sessionToken)
          .setShowActionsInCompactView(0, 2, 4),
      )
      .build()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "AI Book Reader Narration",
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = "Media controls and playback status for book narration"
        setShowBadge(false)
      }
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(channel)
    }
  }

  private fun requestAudioFocus(): Boolean {
    if (hasAudioFocus) return true
    val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build(),
        )
        .setAcceptsDelayedFocusGain(false)
        .setOnAudioFocusChangeListener(focusChangeListener, mainHandler)
        .build()
      audioFocusRequest = request
      audioManager.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      audioManager.requestAudioFocus(
        focusChangeListener,
        AudioManager.STREAM_MUSIC,
        AudioManager.AUDIOFOCUS_GAIN,
      )
    }
    hasAudioFocus = (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED)
    return hasAudioFocus
  }

  private fun abandonAudioFocus() {
    if (!hasAudioFocus) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
    } else {
      @Suppress("DEPRECATION")
      audioManager.abandonAudioFocus(focusChangeListener)
    }
    hasAudioFocus = false
  }

  private val focusChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
    when (focusChange) {
      AudioManager.AUDIOFOCUS_LOSS -> {
        hasAudioFocus = false
        resumeOnFocusGain = false
        pausePlayback()
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
        hasAudioFocus = false
        resumeOnFocusGain = (currentState == "playing")
        pausePlayback()
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
        activePlayer?.setVolume(0.2f, 0.2f)
      }
      AudioManager.AUDIOFOCUS_GAIN -> {
        hasAudioFocus = true
        activePlayer?.setVolume(1.0f, 1.0f)
        if (resumeOnFocusGain) {
          resumeOnFocusGain = false
          resumePlayback()
        }
      }
    }
  }

  private fun registerNoisyReceiver() {
    if (!noisyReceiverRegistered) {
      registerReceiver(becomingNoisyReceiver, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY))
      noisyReceiverRegistered = true
    }
  }

  private fun unregisterNoisyReceiver() {
    if (noisyReceiverRegistered) {
      try {
        unregisterReceiver(becomingNoisyReceiver)
      } catch (_: Exception) { }
      noisyReceiverRegistered = false
    }
  }

  private fun releasePlayers() {
    try {
      activePlayer?.let {
        if (it.isPlaying) it.stop()
        it.reset()
        it.release()
      }
    } catch (_: Exception) { }
    activePlayer = null

    try {
      nextPlayer?.let {
        it.reset()
        it.release()
      }
    } catch (_: Exception) { }
    nextPlayer = null
    nextPreparedSentenceIndex = -1
  }
}
