"use client";

import { useState } from "react";
import { IconPlay } from "./Icons";

/** Shows the YouTube thumbnail; swaps in the real player on tap (privacy-friendly embed). */
export function VideoEmbed({ videoId, title, image }: { videoId: string; title: string; image?: string }) {
  const [playing, setPlaying] = useState(false);
  const poster = image ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return (
    <div className="video">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={poster} alt="" loading="lazy" />
          <button type="button" className="video__play" aria-label={`Play: ${title}`} onClick={() => setPlaying(true)}>
            <span>
              <IconPlay size={24} />
            </span>
          </button>
        </>
      )}
    </div>
  );
}
