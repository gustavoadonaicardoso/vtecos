import { useEffect, useRef, useState } from 'react';
import { MoreVertical, Pause, Play } from 'lucide-react';
import styles from '../messages.module.css';

interface AudioPlayerProps {
  url: string;
  duration?: number;
}

export default function AudioPlayer({ url, duration }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      setProgress((audio.currentTime / audio.duration) * 100);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className={styles.whatsappAudio}>
      <audio ref={audioRef} src={url} />
      <div className={styles.audioRow}>
        <div className={styles.audioControls}>
          <button className={styles.playBtn} onClick={togglePlay}>
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <div className={styles.audioTrack}>
            <div className={styles.audioProgress} style={{ width: `${progress}%` }}></div>
          </div>
        </div>
        <MoreVertical size={16} opacity={0.5} />
      </div>
      <span style={{ fontSize: '0.75rem', opacity: 0.6, marginLeft: '8px' }}>
        {isPlaying ? `0:${Math.floor(audioRef.current?.currentTime || 0).toString().padStart(2, '0')}` : '0:00'} /
        {`0:${(duration || 5).toString().padStart(2, '0')}`}
      </span>
    </div>
  );
}
