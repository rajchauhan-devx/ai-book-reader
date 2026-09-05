package com.aireader.library;

import android.content.Context;
import androidx.room.Database;
import androidx.room.Room;
import androidx.room.RoomDatabase;
import androidx.room.migration.Migration;
import androidx.sqlite.db.SupportSQLiteDatabase;

@Database(
    entities = {
      BookEntity.class,
      ChapterEntity.class,
      ContentBlockEntity.class,
      SentenceEntity.class,
      ReadingPositionEntity.class
    },
    version = 4,
    exportSchema = true)
public abstract class LibraryDatabase extends RoomDatabase {
  private static volatile LibraryDatabase instance;

  public static final Migration MIGRATION_1_2 = new Migration(1, 2) {
    @Override public void migrate(SupportSQLiteDatabase database) {
      database.execSQL("ALTER TABLE books ADD COLUMN parserVersion TEXT");
      database.execSQL("ALTER TABLE books ADD COLUMN preparationId TEXT");
      database.execSQL("ALTER TABLE books ADD COLUMN preparationProgress INTEGER NOT NULL DEFAULT 0");
      database.execSQL("ALTER TABLE books ADD COLUMN preparationMessage TEXT");
      database.execSQL("ALTER TABLE sentences ADD COLUMN normalizedText TEXT NOT NULL DEFAULT ''");
      database.execSQL("ALTER TABLE sentences ADD COLUMN sourceAnchor TEXT");
      database.execSQL("UPDATE sentences SET normalizedText = text");
    }
  };

  public abstract LibraryDao libraryDao();

  public static final Migration MIGRATION_2_3 = new Migration(2, 3) {
    @Override public void migrate(SupportSQLiteDatabase database) {
      database.execSQL("ALTER TABLE books ADD COLUMN metadataEdited INTEGER NOT NULL DEFAULT 0");
      database.execSQL("ALTER TABLE books ADD COLUMN coverChoice INTEGER NOT NULL DEFAULT -1");
      database.execSQL("ALTER TABLE books ADD COLUMN coverImagePath TEXT");
      database.execSQL("ALTER TABLE books ADD COLUMN parsingWarnings TEXT");
      database.execSQL("ALTER TABLE books ADD COLUMN previewChapterId TEXT");
      database.execSQL("ALTER TABLE books ADD COLUMN previewBlockOffset INTEGER NOT NULL DEFAULT 0");
    }
  };

  public static final Migration MIGRATION_3_4 = new Migration(3, 4) {
    @Override public void migrate(SupportSQLiteDatabase database) {
      database.execSQL("ALTER TABLE books ADD COLUMN genre TEXT NOT NULL DEFAULT 'Uncategorized'");
      database.execSQL("CREATE INDEX IF NOT EXISTS index_books_genre ON books (genre)");
    }
  };

  public static LibraryDatabase get(Context context) {
    LibraryDatabase current = instance;
    if (current != null) return current;
    synchronized (LibraryDatabase.class) {
      if (instance == null) {
        instance = Room.databaseBuilder(
                context.getApplicationContext(),
                LibraryDatabase.class,
                "ai-reader-library.db")
            .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4)
            .build();
      }
      return instance;
    }
  }
}
