import App from "../App";
import type { SolidToursSession } from "../embedAuth";

export type { SolidToursSession } from "../embedAuth";

export type SolidToursEmbedProps = {
  webId?: string | null;
  demoWebId?: string | null;
  language?: string | null;
  session?: SolidToursSession | null;
};

export default function SolidToursEmbed({
  webId = null,
  demoWebId = null,
  language = null,
  session = null,
}: SolidToursEmbedProps) {
  return (
    <App
      embedded
      webIdOverride={webId}
      demoWebIdOverride={demoWebId}
      language={language}
      session={session}
    />
  );
}
