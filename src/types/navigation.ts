import type {NavigatorScreenParams} from '@react-navigation/native';

export type MainTabParamList = {
  Home: undefined;
  Library: undefined;
  Bookmarks: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  ModelSetup: undefined;
  ImportBook: undefined;
  BookDetails: {bookId: string};
  Reader: {
    bookId: string;
    initialChapterId?: string;
    initialSentenceIndex?: number;
    mode?: 'read' | 'audiobook';
  };
  TextPreview: {bookId: string};
  Storage: undefined;
  BackupRestore: undefined;
  PrivacyAbout: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
