// 전역 BGM 싱글톤 - 선택적 루프 재생
export const BGM_TRACKS = [
  { src: '/bgm0.mp3', title: 'Star Dragoner Jackknife' },
  { src: '/bgm1.mp3', title: "Dark Summoner's Oath 1" },
  { src: '/bgm2.mp3', title: "Dark Summoner's Oath 2" },
  { src: '/bgm3.mp3', title: 'Harmonious Link' },
  { src: '/bgm4.mp3', title: 'Night Bus 3AM' },
  { src: '/bgm5.mp3', title: 'Sophomore' },
  { src: '/bgm6.mp3', title: 'Track 7' },
];

const PLAYLIST_KEY = 'bf_bgm_playlist';

let _audio = null;
let _idx = 0;
let _playing = false;
let _volume = 0.35;
let _playlist = null; // null = 전체, 또는 [0,2,3] 같은 인덱스 배열
const _listeners = new Set();

function getPlaylist() {
  if (_playlist && _playlist.length > 0) return _playlist;
  return BGM_TRACKS.map((_, i) => i); // 전체
}

function notify() {
  _listeners.forEach(fn => fn({ playing: _playing, idx: _idx, title: BGM_TRACKS[_idx]?.title, playlist: getPlaylist() }));
}

function getAudio() {
  if (!_audio) {
    _audio = new Audio(BGM_TRACKS[_idx].src);
    _audio.volume = _volume;
    _audio.addEventListener('ended', () => bgmNext());
  }
  return _audio;
}

export function bgmPlay() {
  getAudio().play().catch(() => {});
  _playing = true; notify();
}

export function bgmPause() {
  if (_audio) _audio.pause();
  _playing = false; notify();
}

export function bgmToggle() {
  _playing ? bgmPause() : bgmPlay();
}

export function bgmNext() {
  const wasPlaying = _playing;
  if (_audio) { _audio.pause(); _audio.src = ''; _audio = null; }
  const pl = getPlaylist();
  const curPos = pl.indexOf(_idx);
  _idx = pl[(curPos + 1) % pl.length]; // 플레이리스트 내에서 순환
  _audio = new Audio(BGM_TRACKS[_idx].src);
  _audio.volume = _volume;
  _audio.addEventListener('ended', () => bgmNext());
  if (wasPlaying) _audio.play().catch(() => {});
  _playing = wasPlaying; notify();
}

export function bgmSetPlaylist(indices) {
  // indices: 선택된 트랙 인덱스 배열. 빈 배열이면 전체
  _playlist = indices && indices.length > 0 ? indices : null;
  try { localStorage.setItem(PLAYLIST_KEY, JSON.stringify(_playlist || [])); } catch {}
  // 현재 재생 중이 플레이리스트에 없으면 첫 번째로 이동
  if (_playlist && !_playlist.includes(_idx)) {
    const wasPlaying = _playing;
    if (_audio) { _audio.pause(); _audio.src = ''; _audio = null; }
    _idx = _playlist[0];
    _audio = new Audio(BGM_TRACKS[_idx].src);
    _audio.volume = _volume;
    _audio.addEventListener('ended', () => bgmNext());
    if (wasPlaying) _audio.play().catch(() => {});
    _playing = wasPlaying;
  }
  notify();
}

export function bgmLoadPlaylist() {
  try {
    const saved = JSON.parse(localStorage.getItem(PLAYLIST_KEY) || '[]');
    if (saved.length > 0) _playlist = saved;
  } catch {}
}

export function bgmSubscribe(fn) {
  _listeners.add(fn);
  fn({ playing: _playing, idx: _idx, title: BGM_TRACKS[_idx]?.title, playlist: getPlaylist() });
  return () => _listeners.delete(fn);
}

export function bgmAutoStart() {
  bgmLoadPlaylist();
  if (!_playing && !_audio) bgmPlay();
}
