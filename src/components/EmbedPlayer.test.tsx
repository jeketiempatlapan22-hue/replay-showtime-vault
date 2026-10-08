import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EmbedPlayer from './EmbedPlayer';

afterEach(() => {
  cleanup();
  delete (window as Window & { YT?: unknown }).YT;
});

describe('native YouTube controls', () => {
  it.each([false, true])('keeps native controls unobstructed (live=%s)', async (isLive) => {
    let config: Record<string, any> = {};
    const iframe = document.createElement('iframe');
    const playVideo = vi.fn();
    const setPlaybackQuality = vi.fn();
    const unloadModule = vi.fn();
    class Player {
      constructor(mount: HTMLElement, options: Record<string, any>) {
        config = options;
        mount.replaceWith(iframe);
      }
      getIframe = () => iframe;
      playVideo = playVideo;
      setVolume = vi.fn();
      mute = vi.fn();
      pauseVideo = vi.fn();
      destroy = vi.fn();
      getDuration = () => 0;
      getCurrentTime = () => 0;
      setPlaybackQuality = setPlaybackQuality;
      unloadModule = unloadModule;
    }
    Object.assign(window, { YT: { Player } });
    const onTvClick = vi.fn();
    const view = render(<EmbedPlayer type="youtube" source="dQw4w9WgXcQ" title="Replay" isLive={isLive} onTvClick={onTvClick} />);
    await waitFor(() => expect(config.playerVars).toBeDefined());
    expect(config.host).toBe('https://www.youtube-nocookie.com');
    expect(config.playerVars).toMatchObject({ controls: 1, fs: 1, disablekb: 0, playsinline: 1, iv_load_policy: 3 });
    fireEvent(window, new Event('focus'));
    config.events.onReady();
    config.events.onStateChange({ data: 2 });
    await waitFor(() => {
      expect(view.queryByRole('button', { name: 'Putar' })).not.toBeInTheDocument();
      expect(view.queryByText('🔊 Tap untuk aktifkan suara')).not.toBeInTheDocument();
    });
    expect(view.container.querySelector('[data-player-root] .absolute.inset-x-0.bottom-0')).toHaveClass('hidden');
    const pairing = view.getByRole('button', { name: 'Hubungkan ke TV / Proyektor' });
    expect(view.container.querySelector('[data-player-root]')?.contains(pairing)).toBe(false);
    fireEvent.click(pairing);
    expect(onTvClick).toHaveBeenCalledOnce();
    expect(setPlaybackQuality).not.toHaveBeenCalled();
    expect(unloadModule).not.toHaveBeenCalled();
    expect(playVideo).toHaveBeenCalledTimes(1);
  });
});