package com.aireader.library;

import androidx.annotation.NonNull;
import androidx.room.Entity;
import androidx.room.ForeignKey;
import androidx.room.Index;
import androidx.room.PrimaryKey;

@Entity(
    tableName = "reading_positions",
    foreignKeys = @ForeignKey(
        entity = BookEntity.class,
        parentColumns = "id",
        childColumns = "bookId",
        onDelete = ForeignKey.CASCADE),
    indices = @Index(value = {"chapterId"}))
public class ReadingPositionEntity {
  @PrimaryKey @NonNull public String bookId = "";
  @NonNull public String chapterId = "";
  public int sentenceIndex = 0;
  public long audioOffsetMs = 0L;
  public long updatedAt = 0L;
}
