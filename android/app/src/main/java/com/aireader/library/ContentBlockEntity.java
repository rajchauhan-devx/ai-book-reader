package com.aireader.library;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.room.Entity;
import androidx.room.ForeignKey;
import androidx.room.Index;
import androidx.room.PrimaryKey;

@Entity(
    tableName = "content_blocks",
    foreignKeys = @ForeignKey(
        entity = ChapterEntity.class,
        parentColumns = "id",
        childColumns = "chapterId",
        onDelete = ForeignKey.CASCADE),
    indices = {
      @Index(value = {"chapterId"}),
      @Index(value = {"chapterId", "ordinal"}, unique = true)
    })
public class ContentBlockEntity {
  @PrimaryKey @NonNull public String id = "";
  @NonNull public String chapterId = "";
  public int ordinal = 0;
  @NonNull public String kind = "paragraph";
  @NonNull public String text = "";
  @Nullable public String sourceAnchor;
  @NonNull public String checksum = "";
}
