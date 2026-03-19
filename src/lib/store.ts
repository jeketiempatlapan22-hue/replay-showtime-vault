import { AppData, ReplayCard, MasterPassword } from './types';

const STORAGE_KEY = 'replaytime_data';

const defaultData: AppData = {
  replays: [],
  masterPasswords: [],
};

export function getData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData;
    return JSON.parse(raw) as AppData;
  } catch {
    return defaultData;
  }
}

function saveData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function addReplay(replay: ReplayCard) {
  const data = getData();
  data.replays.push(replay);
  saveData(data);
}

export function updateReplay(id: string, updated: Partial<ReplayCard>) {
  const data = getData();
  data.replays = data.replays.map(r => r.id === id ? { ...r, ...updated } : r);
  saveData(data);
}

export function deleteReplay(id: string) {
  const data = getData();
  data.replays = data.replays.filter(r => r.id !== id);
  saveData(data);
}

export function setMasterPassword(month: string, password: string) {
  const data = getData();
  const existing = data.masterPasswords.find(m => m.month === month);
  if (existing) {
    existing.password = password;
  } else {
    data.masterPasswords.push({ month, password });
  }
  saveData(data);
}

export function getMasterPassword(month: string): string | undefined {
  const data = getData();
  return data.masterPasswords.find(m => m.month === month)?.password;
}

export function getAllMasterPasswords(): MasterPassword[] {
  return getData().masterPasswords;
}

export function getReplays(): ReplayCard[] {
  return getData().replays.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getReplaysByMonth(): Record<string, ReplayCard[]> {
  const replays = getReplays();
  const grouped: Record<string, ReplayCard[]> = {};
  for (const r of replays) {
    const d = new Date(r.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }
  return grouped;
}

export function verifyPassword(replayId: string, password: string): boolean {
  const data = getData();
  const replay = data.replays.find(r => r.id === replayId);
  if (!replay) return false;
  
  // Check unit password
  if (replay.password === password) return true;
  
  // Check master password for that month
  const d = new Date(replay.date);
  const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const master = data.masterPasswords.find(m => m.month === monthKey);
  if (master && master.password === password) return true;
  
  return false;
}
