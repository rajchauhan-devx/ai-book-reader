package com.aireader.library;

import androidx.annotation.NonNull;
import androidx.room.Entity;
import androidx.room.ColumnInfo;
import androidx.annotation.Nullable;
import androidx.room.ForeignKey;
import androidx.room.Index;
import androidx.room.PrimaryKey;

@Entity(
    tableName = "sentences",
    foreignKeys = @ForeignKey(
        entity = ContentBlockEntity.class,
        parentColumns = "id",
        childColumns = "blockId",
        onDelete = ForeignKey.CASCADE),
    indices = {
      @Index(value = {"blockId"}),
      @Index(value = {"blockId", "ordinal"}, unique = true)
    })
public class SentenceEntity {
  @PrimaryKey @NonNull public String id = "";
  @NonNull public String blockId = "";
  public int ordinal = 0;
  @NonNull public String text = "";
  @NonNull public String normalizedChecksum = "";
  @NonNull @ColumnInfo(defaultValue = "''") public String normalizedText = "";
  @Nullable public String sourceAnchor;
}
