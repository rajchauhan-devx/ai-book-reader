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

    return text.replace(Regex("[ \\t]+"), " ").trim()
  }
}
