package com.aireader.library;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.room.Entity;
import androidx.room.ForeignKey;
import androidx.room.Index;
import androidx.room.PrimaryKey;

@Entity(
    tableName = "chapters",
    foreignKeys = @ForeignKey(
        entity = BookEntity.class,
        parentColumns = "id",
        childColumns = "bookId",
        onDelete = ForeignKey.CASCADE),
    indices = {
      @Index(value = {"bookId"}),
      @Index(value = {"bookId", "ordinal"}, unique = true)
    })
public class ChapterEntity {
  @PrimaryKey @NonNull public String id = "";
  @NonNull public String bookId = "";
  public int ordinal = 0;
  @NonNull public String title = "Untitled chapter";
  @Nullable public String sourceAnchor;
}
