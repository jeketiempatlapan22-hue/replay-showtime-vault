export interface ReplayCard {
  id: string;
  title: string;
  date: string; // ISO date string
  criteria: string;
  lineup: string[];
  password: string;
  youtubeId: string;
  imageUrl: string;
}

export interface MasterPassword {
  month: string; // format: "YYYY-MM"
  password: string;
}

export interface AppData {
  replays: ReplayCard[];
  masterPasswords: MasterPassword[];
}
