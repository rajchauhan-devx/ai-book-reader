package com.aireader.narration

import org.junit.Assert.assertEquals
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
}
