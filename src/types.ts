export interface Song {
  id: string;
  title: string;
  keys: string[];
  themes: string[];
  hymnNo: number | null;
}

export interface SongData {
  generatedAt: string;
  source: string;
  keys: string[];
  themes: string[];
  songs: Song[];
}
