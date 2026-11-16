import { useEffect, useState } from "react";
import { apiErrorMessage } from "../api/apiError";
import { FieldErr, Icon, Spinner } from "../ui/kit";

/** Opens a stored file (image or PDF) right in the window it was asked from, instead of a new browser tab. */
export default function FilePreview({ load, type, name, label = "View" }: { load: () => Promise<Blob>; type: string | null; name: string | null; label?: string }) {
  const [url, setUrl] = useState(""), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const toggle = async () => {
    if (url) { setOpen(!open); return; }
    setBusy(true); setErr("");
    try { setUrl(URL.createObjectURL(await load())); setOpen(true); }
    catch (ex) { setErr(apiErrorMessage(ex, "Couldn't open the file")); } finally { setBusy(false); }
  };
  return <>
    <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} onClick={toggle} disabled={busy}>
      {busy ? <Spinner s={15} /> : <Icon n={open ? "x" : "image"} s={15} />}{open ? "Hide" : label}</button>
    {open && url && <div className="receipt-view">{type === "application/pdf" ? <iframe src={url} title={name ?? "File"} /> : <img src={url} alt={name ?? "File"} />}</div>}
    <FieldErr msg={err} />
  </>;
}
