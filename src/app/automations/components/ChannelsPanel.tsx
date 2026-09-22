import React from "react";
import { Check, Settings2 } from "lucide-react";
import styles from "../automations.module.css";
import { CHANNELS } from "../constants";
import type { ChannelId } from "../types";

interface ChannelsPanelProps {
  activeChannels: ChannelId[];
  onToggleChannel: (channel: ChannelId) => void;
}

export default function ChannelsPanel({ activeChannels, onToggleChannel }: ChannelsPanelProps) {
  return (
    <div className={styles.channelPanel}>
      <div className={styles.panelTitleRow}><span>CANAIS DO FLUXO</span><Settings2 size={14} /></div>
      <p className={styles.panelHint}>Ative os canais que este projeto poderá usar.</p>
      <div className={styles.channelGrid}>
        {CHANNELS.map(channel => {
          const ChannelIcon = channel.icon;
          const active = activeChannels.includes(channel.id);
          return (
            <button type="button" key={channel.id} className={`${styles.channelButton} ${active ? styles.channelButtonActive : ""}`} onClick={() => onToggleChannel(channel.id)} style={{ "--channel-color": channel.color } as React.CSSProperties}>
              <ChannelIcon size={15} /><span>{channel.label}</span>{active && <Check size={13} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
