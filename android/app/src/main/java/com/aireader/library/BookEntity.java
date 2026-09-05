package com.aireader.library;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.room.Entity;
import androidx.room.ColumnInfo;
import androidx.room.Index;
import androidx.room.PrimaryKey;

@Entity(
    tableName = "books",
    indices = {
      @Index(value = {"sourceSha256"}, unique = true),
      @Index(value = {"updatedAt"}),
      @Index(value = {"importState"}),
      @Index(value = {"genre"})
    })
public class BookEntity {
  @PrimaryKey @NonNull public String id = "";
  @NonNull public String sourceSha256 = "";
  @NonNull public String sourceFileName = "";
  @NonNull public String storedFilePath = "";
  @NonNull public String mimeType = "application/octet-stream";
  @NonNull public String format = "txt";
  public long sourceSizeBytes = 0L;
  @NonNull public String title = "Untitled book";
  @NonNull public String author = "Unknown author";
  @NonNull @ColumnInfo(defaultValue = "'Uncategorized'") public String genre = "Uncategorized";
  @NonNull public String importState = "pending_parse";
  @Nullable public String failureCode;
  @Nullable public String failureMessage;
  public int progressPercent = 0;
  @Nullable public String currentChapterId;
  public long createdAt = 0L;
  public long updatedAt = 0L;
  @Nullable public Long lastOpenedAt;
  @Nullable public String parserVersion;
  @Nullable public String preparationId;
  @ColumnInfo(defaultValue = "0") public int preparationProgress = 0;
  @Nullable public String preparationMessage;
  @ColumnInfo(defaultValue = "0") public boolean metadataEdited = false;
  @ColumnInfo(defaultValue = "-1") public int coverChoice = -1;
  @Nullable public String coverImagePath;
  @Nullable public String parsingWarnings;
  @Nullable public String previewChapterId;
  @ColumnInfo(defaultValue = "0") public int previewBlockOffset = 0;
}
