package com.aireader.narration

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TextNormalizerTest {
  @Test
  fun testFixLigatureSplitsAndDehyphenation() {
    val input = "The in-\nformation was con-\r\nfidential in the of fice."
    val expected = "The information was confidential in the office."
    assertEquals(expected, TextNormalizer.fixLigatureSplits(input))
  }

  @Test
  fun testRemovesSoftHyphensAndZeroWidthSpaces() {
    val input = "A dif\u00ADferent af fair with fl ow and fil ed pa\u200Bpers."
    val expected = "A different affair with flow and filled papers."
    assertEquals(expected, TextNormalizer.fixLigatureSplits(input))
  }

  @Test
  fun testNormalizeForNarrationExpandsAbbreviationsAndNumbers() {
    val input = "Mr. Darcy paid $25 for ch. 4."
    val result = TextNormalizer.normalize(input)
    assertEquals("Mister Darcy paid twenty-five dollars for chapter four.", result)
  }

  @Test
  fun testRestoresMissingDoubleLAndContractions() {
    val input = "He was going to cal Jason out. “We'l arrive in five minutes!”"
    val result = TextNormalizer.fixLigatureSplits(input)
    assertEquals("He was going to call Jason out. “We'll arrive in five minutes!”", result)
  }

  @Test
  fun testContextualDoubleLRepairsWithoutVariableLookbehind() {
    val input = "It went as wel as expected, very wel indeed, and in al the rooms."
    val result = TextNormalizer.fixLigatureSplits(input)
    assertEquals("It went as well as expected, very well indeed, and in all the rooms.", result)
  }

  @Test
  fun testRepairsUnspacedTitlesAndNormalizes() {
    val input = "He met mr.raj yesterday."
    val result = TextNormalizer.normalize(input)
    assertEquals("He met Mister Raj yesterday.", result)
  }

  @Test
  fun testIsAbbreviationOrInitialDetectsTitlesAndInitials() {
    assertTrue(TextNormalizer.isAbbreviationOrInitial("He saw Mr."))
    assertTrue(TextNormalizer.isAbbreviationOrInitial("He met Dr."))
    assertTrue(TextNormalizer.isAbbreviationOrInitial("She called Prof."))
    assertTrue(TextNormalizer.isAbbreviationOrInitial("Written by J."))
    assertTrue(TextNormalizer.isAbbreviationOrInitial("e.g."))
    assertFalse(TextNormalizer.isAbbreviationOrInitial("He saw Raj."))
    assertFalse(TextNormalizer.isAbbreviationOrInitial("This is fine."))
    assertFalse(TextNormalizer.isAbbreviationOrInitial("Doctor."))
  }

  @Test
  fun testSplitSentencesDoesNotSplitOnTitlesOrInitials() {
    val text = "I saw Mr. Raj at the train station. He spoke with Dr. Watson about J. K. Rowling."
    val spans = TextNormalizer.splitSentences(text)
    assertEquals(2, spans.size)
    assertEquals("I saw Mr. Raj at the train station. ", spans[0].text)
    assertEquals("He spoke with Dr. Watson about J. K. Rowling.", spans[1].text)
  }

  @Test
  fun testSplitSentencesWithMultipleTitlesAndAbbreviations() {
    val text = "Capt. Miller said to Lt. Dan: We will arrive at 5 p.m. at Baker St. Then we rest."
    val spans = TextNormalizer.splitSentences(text)
    assertEquals(2, spans.size)
    assertTrue(spans[0].text.startsWith("Capt. Miller"))
    assertEquals("Then we rest.", spans[1].text.trim())
  }
}
