package com.aireader.narration

import java.util.Locale
import java.util.regex.Pattern

object TextNormalizer {

  private val ONES = arrayOf(
    "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen"
  )

  private val TENS = arrayOf(
    "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"
  )

  private val ORDINALS = mapOf(
    "1st" to "first",
    "2nd" to "second",
    "3rd" to "third",
    "4th" to "fourth",
    "5th" to "fifth",
    "6th" to "sixth",
    "7th" to "seventh",
    "8th" to "eighth",
    "9th" to "ninth",
    "10th" to "tenth",
    "11th" to "eleventh",
    "12th" to "twelfth",
    "13th" to "thirteenth",
    "20th" to "twentieth",
    "21st" to "twenty-first",
    "22nd" to "twenty-second",
    "30th" to "thirtieth",
    "50th" to "fiftieth",
    "100th" to "hundredth"
  )

  private val ABBREVIATIONS = listOf(
    Pattern.compile("\\bMr\\.(?=\\s|$)", Pattern.CASE_INSENSITIVE) to "Mister",
    Pattern.compile("\\bMrs\\.(?=\\s|$)", Pattern.CASE_INSENSITIVE) to "Missus",
    Pattern.compile("\\bMs\\.(?=\\s|$)", Pattern.CASE_INSENSITIVE) to "Miss",
    Pattern.compile("\\bDr\\.(?=\\s|$)", Pattern.CASE_INSENSITIVE) to "Doctor",
    Pattern.compile("\\bProf\\.(?=\\s|$)", Pattern.CASE_INSENSITIVE) to "Professor",
    Pattern.compile("\\bSt\\.(?=\\s+[A-Z])") to "Saint",
    Pattern.compile("\\bCapt\\.(?=\\s|$)", Pattern.CASE_INSENSITIVE) to "Captain",
    Pattern.compile("\\bCol\\.(?=\\s|$)", Pattern.CASE_INSENSITIVE) to "Colonel",
    Pattern.compile("\\bGen\\.(?=\\s|$)", Pattern.CASE_INSENSITIVE) to "General",
    Pattern.compile("\\bLt\\.(?=\\s|$)", Pattern.CASE_INSENSITIVE) to "Lieutenant",
    Pattern.compile("\\bSgt\\.(?=\\s|$)", Pattern.CASE_INSENSITIVE) to "Sergeant",
    Pattern.compile("\\bRev\\.(?=\\s|$)", Pattern.CASE_INSENSITIVE) to "Reverend",
    Pattern.compile("\\bJr\\.(?=\\s|[.,]|$)", Pattern.CASE_INSENSITIVE) to "Junior",
    Pattern.compile("\\bSr\\.(?=\\s|[.,]|$)", Pattern.CASE_INSENSITIVE) to "Senior",
    Pattern.compile("\\bchap\\.\\s*(\\d+)", Pattern.CASE_INSENSITIVE) to "chapter $1",
    Pattern.compile("\\bch\\.\\s*(\\d+)", Pattern.CASE_INSENSITIVE) to "chapter $1",
    Pattern.compile("\\bvol\\.\\s*(\\d+)", Pattern.CASE_INSENSITIVE) to "volume $1",
    Pattern.compile("\\bsec\\.\\s*(\\d+)", Pattern.CASE_INSENSITIVE) to "section $1",
    Pattern.compile("\\bpp\\.\\s*(\\d+)", Pattern.CASE_INSENSITIVE) to "pages $1",
    Pattern.compile("\\bp\\.\\s*(\\d+)", Pattern.CASE_INSENSITIVE) to "page $1",
    Pattern.compile("\\bvs\\.(?=\\s|$)", Pattern.CASE_INSENSITIVE) to "versus",
    Pattern.compile("\\betc\\.(?=[,;])", Pattern.CASE_INSENSITIVE) to "etcetera",
    Pattern.compile("\\betc\\.", Pattern.CASE_INSENSITIVE) to "etcetera.",
    Pattern.compile("\\be\\.g\\.,?\\s*", Pattern.CASE_INSENSITIVE) to "for example, ",
    Pattern.compile("\\bi\\.e\\.,?\\s*", Pattern.CASE_INSENSITIVE) to "that is, ",
    Pattern.compile("\\bapprox\\.(?=\\s|$)", Pattern.CASE_INSENSITIVE) to "approximately",
    Pattern.compile("\\bdept\\.(?=\\s|$)", Pattern.CASE_INSENSITIVE) to "department"
  )

  fun integerToWords(number: Long): String {
    if (number == 0L) return "zero"
    if (number < 0L) return "negative ${integerToWords(Math.abs(number))}"

    fun convertHundreds(n: Int): String {
      val sb = StringBuilder()
      var rem = n
      if (rem >= 100) {
        sb.append(ONES[rem / 100]).append(" hundred")
        rem %= 100
        if (rem > 0) sb.append(" ")
      }
      if (rem >= 20) {
        sb.append(TENS[rem / 10])
        val single = rem % 10
        if (single > 0) sb.append("-").append(ONES[single])
      } else if (rem > 0) {
        sb.append(ONES[rem])
      }
      return sb.toString()
    }

    val sb = StringBuilder()
    val billions = (number / 1_000_000_000L).toInt()
    val millions = ((number % 1_000_000_000L) / 1_000_000L).toInt()
    val thousands = ((number % 1_000_000L) / 1_000L).toInt()
    val remainder = (number % 1_000L).toInt()

    if (billions > 0) sb.append(convertHundreds(billions)).append(" billion ")
    if (millions > 0) sb.append(convertHundreds(millions)).append(" million ")
    if (thousands > 0) sb.append(convertHundreds(thousands)).append(" thousand ")
    if (remainder > 0) sb.append(convertHundreds(remainder))

    return sb.toString().trim()
  }

  private fun yearToWords(year: Int): String {
    if (year in 2000..2009) {
      val suffix = if (year == 2000) "" else " ${ONES[year - 2000]}"
      return "two thousand$suffix".trim()
    }
    val century = year / 100
    val decade = year % 100
    val centuryWord = integerToWords(century.toLong())
    if (decade == 0) return "$centuryWord hundred"
    if (decade < 10) return "$centuryWord oh-${ONES[decade]}"
    return "$centuryWord ${integerToWords(decade.toLong())}"
  }

  fun normalize(rawText: String?): String {
    if (rawText.isNullOrBlank()) return ""
    var text = rawText.trim()

    for ((pattern, replacement) in ABBREVIATIONS) {
      text = pattern.matcher(text).replaceAll(replacement)
    }

    text = text.replace("&", " and ")
      .replace("@", " at ")
      .replace("+", " plus ")
      .replace("=", " equals ")

    // Pauses
    text = text.replace(Regex("[\\u2014\\u2013]|--+"), ", ")
    text = text.replace(Regex("\\.{3,}|\\u2026"), ", ")

    // Strip markdown chars
    text = text.replace(Regex("[*_~`#\\[\\]]"), " ")

    // Currencies
    text = text.replace(Regex("\\$([0-9]+(?:\\.[0-9]{1,2})?)")) { match ->
      val numStr = match.groupValues[1]
      val num = numStr.toDoubleOrNull() ?: return@replace match.value
      if (!numStr.contains(".")) {
        val w = integerToWords(num.toLong())
        "$w dollar${if (num.toLong() == 1L) "" else "s"}"
      } else {
        val parts = numStr.split(".")
        val dWords = integerToWords(parts[0].toLongOrNull() ?: 0L)
        val cents = parts[1].padEnd(2, '0').toIntOrNull() ?: 0
        val cWords = integerToWords(cents.toLong())
        "$dWords dollars and $cWords cents"
      }
    }

    text = text.replace(Regex("£([0-9]+(?:\\.[0-9]{1,2})?)")) { match ->
      val num = match.groupValues[1].toLongOrNull() ?: return@replace match.value
      "${integerToWords(num)} pound${if (num == 1L) "" else "s"}"
    }

    text = text.replace(Regex("€([0-9]+(?:\\.[0-9]{1,2})?)")) { match ->
      val num = match.groupValues[1].toLongOrNull() ?: return@replace match.value
      "${integerToWords(num)} euro${if (num == 1L) "" else "s"}"
    }

    // Percentages
    text = text.replace(Regex("([0-9]+(?:\\.[0-9]+)?)\\s*%")) { match ->
      val num = match.groupValues[1].toLongOrNull()
      if (num != null) "${integerToWords(num)} percent" else match.value
    }

    // Ordinals
    text = text.replace(Regex("\\b([0-9]+(?:st|nd|rd|th))\\b", RegexOption.IGNORE_CASE)) { match ->
      ORDINALS[match.value.lowercase(Locale.ROOT)] ?: match.value
    }

    // 4-digit years (1000-2099)
    text = text.replace(Regex("\\b(1[0-9]{3}|20[0-9]{2})\\b")) { match ->
      val yr = match.value.toIntOrNull()
      if (yr != null) yearToWords(yr) else match.value
    }

    // Decimals
    text = text.replace(Regex("\\b([0-9]+)\\.([0-9]+)\\b")) { match ->
      val whole = match.groupValues[1].toLongOrNull() ?: return@replace match.value
      val dec = match.groupValues[2]
      val decWords = dec.map { d -> ONES[d.toString().toIntOrNull() ?: 0] }.joinToString(" ")
      "${integerToWords(whole)} point $decWords"
    }

    // Integers up to 9 digits
    text = text.replace(Regex("\\b([0-9]{1,9})\\b")) { match ->
      val num = match.value.toLongOrNull()
      if (num != null) integerToWords(num) else match.value
    }

    text = fixLigatureSplits(text)

    return text.replace(Regex("[ \\t]+"), " ").trim()
  }

  fun fixLigatureSplits(rawText: String?): String {
    if (rawText.isNullOrBlank()) return ""
    var text = rawText

    // Strip soft hyphens and invisible zero-width markers
    text = text.replace("\u00AD", "")
      .replace("\u200B", "")
      .replace("\uFEFF", "")
      .replace("\u00A0", " ")

    // De-hyphenate words broken by line-break or spaced hyphens: e.g. "in- formation" -> "information"
    text = text.replace(Regex("(\\b[A-Za-z]{2,})-(?:[ \\t]*\\r?\\n[ \\t]*|[ \\t]+)([a-z]{2,}\\b)")) { match ->
      val prefix = match.groupValues[1]
      val suffix = match.groupValues[2]
      // Keep legitimate compound prefixes
      if (prefix.equals("self", ignoreCase = true) ||
          prefix.equals("well", ignoreCase = true) ||
          prefix.equals("half", ignoreCase = true) ||
          prefix.equals("all", ignoreCase = true) ||
          prefix.equals("ex", ignoreCase = true) ||
          prefix.equals("non", ignoreCase = true) ||
          prefix.equals("anti", ignoreCase = true)) {
        "$prefix-$suffix"
      } else {
        "$prefix$suffix"
      }
    }

    // Common words frequently broken in EPUB/PDF OCR
    text = text.replace(Regex("\\bFinal y\\b"), "Finally")
    text = text.replace(Regex("\\bfinal y\\b"), "finally")
    text = text.replace(Regex("\\bmarshmal ow(s)?\\b", RegexOption.IGNORE_CASE)) { "marshmallow${it.groupValues[1]}" }
    text = text.replace(Regex("\\bstal ion(s)?\\b", RegexOption.IGNORE_CASE)) { "stallion${it.groupValues[1]}" }
    text = text.replace(Regex("\\bhil\\s+([,.!?;:])")) { "hill${it.groupValues[1]}" }
    text = text.replace(Regex("\\bhil\\b(?!\\s*([a-zA-Z]))"), "hill")

    // Contraction single-l ligature drops: "We'l" -> "We'll", "I'l" -> "I'll", etc.
    text = text.replace(Regex("\\b([Ww]e|[Ii]|[Yy]ou|[Hh]e|[Ss]he|[Tt]hey|[Ii]t|[Ww]ho|[Tt]hat|[Tt]here|[Ww]hat)['’]l\\b")) { match ->
      "${match.groupValues[1]}'ll"
    }

    // Common words where 'll' was reduced to single 'l'
    text = text.replace(Regex("\\bcal\\b(?=[ \\t]+[A-Za-z]|[,.!?;:]|$)", RegexOption.IGNORE_CASE)) { match ->
      if (match.value[0].isUpperCase()) "Call" else "call"
    }
    text = text.replace(Regex("\\bstil\\b", RegexOption.IGNORE_CASE)) { match ->
      if (match.value[0].isUpperCase()) "Still" else "still"
    }
    text = text.replace(Regex("\\bsmal\\b", RegexOption.IGNORE_CASE)) { match ->
      if (match.value[0].isUpperCase()) "Small" else "small"
    }
    text = text.replace(Regex("\\btal\\b", RegexOption.IGNORE_CASE)) { match ->
      if (match.value[0].isUpperCase()) "Tall" else "tall"
    }
    text = text.replace(Regex("\\byel\\b", RegexOption.IGNORE_CASE)) { match ->
      if (match.value[0].isUpperCase()) "Yell" else "yell"
    }
    text = text.replace(Regex("\\bfal\\b", RegexOption.IGNORE_CASE)) { match ->
      if (match.value[0].isUpperCase()) "Fall" else "fall"
    }
    text = text.replace(Regex("\\bwal\\b", RegexOption.IGNORE_CASE)) { match ->
      if (match.value[0].isUpperCase()) "Wall" else "wall"
    }
    text = text.replace(Regex("\\bbal\\b", RegexOption.IGNORE_CASE)) { match ->
      if (match.value[0].isUpperCase()) "Ball" else "ball"
    }
    text = text.replace(Regex("\\btel\\b", RegexOption.IGNORE_CASE)) { match ->
      if (match.value[0].isUpperCase()) "Tell" else "tell"
    }
    text = text.replace(Regex("\\bpul\\b", RegexOption.IGNORE_CASE)) { match ->
      if (match.value[0].isUpperCase()) "Pull" else "pull"
    }
    text = text.replace(Regex("\\bkil\\b", RegexOption.IGNORE_CASE)) { match ->
      if (match.value[0].isUpperCase()) "Kill" else "kill"
    }
    text = text.replace(Regex("\\bwel\\b(?=[ \\t]*,|[ \\t]+(?:done|known|said|thought|off|being|as|to))", RegexOption.IGNORE_CASE)) { match ->
      if (match.value[0].isUpperCase()) "Well" else "well"
    }
    text = text.replace(Regex("\\b(as|very|how)([ \\t]+)(wel)\\b", RegexOption.IGNORE_CASE)) { match ->
      val replacement = if (match.groupValues[3][0].isUpperCase()) "Well" else "well"
      "${match.groupValues[1]}${match.groupValues[2]}$replacement"
    }
    text = text.replace(Regex("\\bal\\b(?=[ \\t]+(?:of|the|right|day|night|over|about|around|alone|along|together|clear))", RegexOption.IGNORE_CASE)) { match ->
      if (match.value[0].isUpperCase()) "All" else "all"
    }
    text = text.replace(Regex("\\b(at|with|in)([ \\t]+)(al)\\b", RegexOption.IGNORE_CASE)) { match ->
      val replacement = if (match.groupValues[3][0].isUpperCase()) "All" else "all"
      "${match.groupValues[1]}${match.groupValues[2]}$replacement"
    }

    // Common broken double-l suffixes: "fil ed" -> "filled", "yel ed" -> "yelled", etc.
    text = text.replace(Regex("\\b(fil|yel|cal|kil|pul|rol|bel|dwi|stil|spe|sme|spi|dri|chi|gri|thr|swel|fulfi) (ed|ing|er|est)\\b", RegexOption.IGNORE_CASE)) { "${it.groupValues[1]}l${it.groupValues[2]}" }

    // Common -ly splits: "real ly" -> "really", "actual ly" -> "actually"
    text = text.replace(Regex("\\b([a-zA-Z]{3,}) (ly)\\b", RegexOption.IGNORE_CASE)) { "${it.groupValues[1]}${it.groupValues[2]}" }

    // Common ff, fi, fl, ffi, ffl ligature dropouts frequently found in PDFs
    text = text.replace(Regex("\\bof fice(s|r|rs)?\\b", RegexOption.IGNORE_CASE)) { "office${it.groupValues[1]}" }
    text = text.replace(Regex("\\bof fer(s|ed|ing)?\\b", RegexOption.IGNORE_CASE)) { "offer${it.groupValues[1]}" }
    text = text.replace(Regex("\\bof ficial(s|ly)?\\b", RegexOption.IGNORE_CASE)) { "official${it.groupValues[1]}" }
    text = text.replace(Regex("\\bof fspring\\b", RegexOption.IGNORE_CASE), "offspring")
    text = text.replace(Regex("\\bof fense(s)?\\b", RegexOption.IGNORE_CASE)) { "offense${it.groupValues[1]}" }
    text = text.replace(Regex("\\bef fect(s|ive|ively)?\\b", RegexOption.IGNORE_CASE)) { "effect${it.groupValues[1]}" }
    text = text.replace(Regex("\\bef fort(s|less)?\\b", RegexOption.IGNORE_CASE)) { "effort${it.groupValues[1]}" }
    text = text.replace(Regex("\\baf ter(wards|noon|noons)?\\b", RegexOption.IGNORE_CASE)) { "after${it.groupValues[1]}" }
    text = text.replace(Regex("\\baf fair(s)?\\b", RegexOption.IGNORE_CASE)) { "affair${it.groupValues[1]}" }
    text = text.replace(Regex("\\baf ford(able|s|ed|ing)?\\b", RegexOption.IGNORE_CASE)) { "afford${it.groupValues[1]}" }
    text = text.replace(Regex("\\baf fect(s|ed|ing)?\\b", RegexOption.IGNORE_CASE)) { "affect${it.groupValues[1]}" }
    text = text.replace(Regex("\\bdif fer(ent|ently|ence|ences|s|ed|ing)?\\b", RegexOption.IGNORE_CASE)) { "differ${it.groupValues[1]}" }
    text = text.replace(Regex("\\bdif ficult(y|ies)?\\b", RegexOption.IGNORE_CASE)) { "difficult${it.groupValues[1]}" }
    text = text.replace(Regex("\\bsuf fer(s|ed|ing|ings)?\\b", RegexOption.IGNORE_CASE)) { "suffer${it.groupValues[1]}" }
    text = text.replace(Regex("\\btra ffic\\b", RegexOption.IGNORE_CASE), "traffic")
    text = text.replace(Regex("\\bstaf f(s)?\\b", RegexOption.IGNORE_CASE)) { "staff${it.groupValues[1]}" }
    text = text.replace(Regex("\\bclif f(s)?\\b", RegexOption.IGNORE_CASE)) { "cliff${it.groupValues[1]}" }
    text = text.replace(Regex("\\bstif f(ly|en|ness)?\\b", RegexOption.IGNORE_CASE)) { "stiff${it.groupValues[1]}" }
    text = text.replace(Regex("\\bcon flict(s|ed|ing)?\\b", RegexOption.IGNORE_CASE)) { "conflict${it.groupValues[1]}" }
    text = text.replace(Regex("\\bcon firm(s|ed|ing|ation)?\\b", RegexOption.IGNORE_CASE)) { "confirm${it.groupValues[1]}" }
    text = text.replace(Regex("\\bcon fident(ly|ce)?\\b", RegexOption.IGNORE_CASE)) { "confident${it.groupValues[1]}" }
    text = text.replace(Regex("\\bcon fuse(s|d|ing|ion)?\\b", RegexOption.IGNORE_CASE)) { "confuse${it.groupValues[1]}" }
    text = text.replace(Regex("\\bcon fession(s)?\\b", RegexOption.IGNORE_CASE)) { "confession${it.groupValues[1]}" }
    text = text.replace(Regex("\\bin fluence(s|d)?\\b", RegexOption.IGNORE_CASE)) { "influence${it.groupValues[1]}" }
    text = text.replace(Regex("\\bin form(s|ed|ing|ation)?\\b", RegexOption.IGNORE_CASE)) { "inform${it.groupValues[1]}" }
    text = text.replace(Regex("\\bre flect(s|ed|ing|ion|ions)?\\b", RegexOption.IGNORE_CASE)) { "reflect${it.groupValues[1]}" }
    text = text.replace(Regex("\\bpro fessor(s)?\\b", RegexOption.IGNORE_CASE)) { "professor${it.groupValues[1]}" }
    text = text.replace(Regex("\\bde fine(s|d)?\\b", RegexOption.IGNORE_CASE)) { "define${it.groupValues[1]}" }
    text = text.replace(Regex("\\bde finite(ly)?\\b", RegexOption.IGNORE_CASE)) { "definite${it.groupValues[1]}" }
    text = text.replace(Regex("\\bfi nd(s|ing)?\\b", RegexOption.IGNORE_CASE)) { "find${it.groupValues[1]}" }
    text = text.replace(Regex("\\bfi rst(ly)?\\b", RegexOption.IGNORE_CASE)) { "first${it.groupValues[1]}" }
    text = text.replace(Regex("\\bfi ve\\b", RegexOption.IGNORE_CASE), "five")
    text = text.replace(Regex("\\bfi re(s|d|ing)?\\b", RegexOption.IGNORE_CASE)) { "fire${it.groupValues[1]}" }
    text = text.replace(Regex("\\bfi nal(ly|s)?\\b", RegexOption.IGNORE_CASE)) { "final${it.groupValues[1]}" }
    text = text.replace(Regex("\\bfi gure(s|d)?\\b", RegexOption.IGNORE_CASE)) { "figure${it.groupValues[1]}" }
    text = text.replace(Regex("\\bfl ow(s|ed|ing)?\\b", RegexOption.IGNORE_CASE)) { "flow${it.groupValues[1]}" }
    text = text.replace(Regex("\\bfl y(ing)?\\b", RegexOption.IGNORE_CASE)) { "fly${it.groupValues[1]}" }
    text = text.replace(Regex("\\bfl ight(s)?\\b", RegexOption.IGNORE_CASE)) { "flight${it.groupValues[1]}" }
    text = text.replace(Regex("\\bfl ame(s)?\\b", RegexOption.IGNORE_CASE)) { "flame${it.groupValues[1]}" }
    text = text.replace(Regex("\\bfl ash(es|ed|ing)?\\b", RegexOption.IGNORE_CASE)) { "flash${it.groupValues[1]}" }
    text = text.replace(Regex("\\bfl oor(s)?\\b", RegexOption.IGNORE_CASE)) { "floor${it.groupValues[1]}" }

    // Clean dangling spaces before punctuation (e.g. "word ," -> "word,")
    text = text.replace(Regex("\\s+([,.!?;:])")) { it.groupValues[1] }

    // Clean spaces inside quotation marks: “ word ” -> “word”
    text = text.replace(Regex("([“\"‘])\\s+"), "$1")
    text = text.replace(Regex("\\s+([”\"’])"), "$1")

    // Collapse multiple consecutive spaces
    text = text.replace(Regex("[ \\t]+"), " ")

    return text.trim()
  }
}
