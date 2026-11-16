import { useState } from "react";
import { useImage } from "../lib/images";
import { catIcon } from "../lib/domain";
import { Icon } from "../ui/kit";

/** An activity photo (private uploads are fetched with the token), or a plain tone with the category icon. */
export default function Photo({ src, category, tone, big, className = "" }: { src?: string | null; category?: string | null; tone: string; big?: boolean; className?: string }) {
  const url = useImage(src);
  const [shown, setShown] = useState<string | null>(null);
  /* The photo fades in over its tone once loaded, instead of painting in line by line. */
  if (src && url) return <div className={"photo-ph " + tone + (big ? " big " : " ") + className}><img src={url} alt="" className={shown === url ? "on" : ""} onLoad={() => setShown(url)} /></div>;
  return <div className={"photo-ph " + tone + (big ? " big " : " ") + className}><Icon n={catIcon(category)} s={28} /></div>;
}

export function Thumb({ src, tone, size = [72, 56] }: { src: string; tone: string; size?: [number, number] }) {
  const url = useImage(src);
  return <span className={url ? "" : tone} style={{ display: "block", width: size[0], height: size[1], borderRadius: 12, overflow: "hidden", background: url ? `url('${url}') center/cover` : "var(--tone)" }} />;
}
