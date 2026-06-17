export type Tempo = "FAST" | "SLOW" | "MEDIUM" | "HYMN";

export interface Song {
  id: string;
  title: string;
  keys: string[];
  tempos: Tempo[];
  themes: string[];
  hymnNo: number | null;
}

export interface SongData {
  generatedAt: string;
  source: string;
  keys: string[];
  tempos: Tempo[];
  themes: string[];
  songs: Song[];
}

export const TEMPO_LABEL: Record<Tempo, string> = {
  FAST: "빠른곡",
  SLOW: "느린곡",
  MEDIUM: "미디움",
  HYMN: "찬송가",
};
