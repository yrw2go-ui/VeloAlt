// Velo's looks — the pictures Velo can wear in the app (chat, call screen,
// floating button…). People pick one in Settings → "🧑 Velo's look".
//
// Adding a new face: drop a 256px and a 96px image (square, already round
// with a transparent outside) in public/velo-avatars/, then add one entry here.

export interface VeloLook {
  id: string;
  label: string;
  /** Large spots (call screen, floating button). */
  src256: string;
  /** Small spots (chat header, message icons). */
  src96: string;
  /** false = the picture isn't a round portrait (e.g. the cloud logo): shown whole, not cropped to a circle. */
  round?: boolean;
  /** Her ElevenLabs voice on calls with this face (resolved on the server only). */
  voiceId?: string;
  /** The voice's name, shown under the face in the picker. */
  voiceName?: string;
}

export const VELO_LOOKS: VeloLook[] = [
  { id: "default", label: "Velo", src256: "/velo-avatars/default-256.webp", src96: "/velo-avatars/default-96.webp", round: true, voiceId: "21m00Tcm4TlvDq8ikWAM", voiceName: "Rachel" },
  { id: "navy", label: "Navy", src256: "/velo-avatars/navy-256.webp", src96: "/velo-avatars/navy-96.webp", round: true, voiceId: "6fLd3vCll0LutxnciLI8", voiceName: "Tiffany" },
  { id: "gray", label: "Gray", src256: "/velo-avatars/gray-256.webp", src96: "/velo-avatars/gray-96.webp", round: true, voiceId: "1FmDfZG0Nx2dCk793S1a", voiceName: "Megan" },
  { id: "burgundy", label: "Burgundy", src256: "/velo-avatars/burgundy-256.webp", src96: "/velo-avatars/burgundy-96.webp", round: true, voiceId: "Mac2FKpSgaGIsaNRXt8A", voiceName: "Emma" },
  { id: "white", label: "White", src256: "/velo-avatars/white-256.webp", src96: "/velo-avatars/white-96.webp", round: true, voiceId: "ii0s2u4R3UFnxKL6DOrz", voiceName: "Maya" },
  { id: "charcoal", label: "Charcoal", src256: "/velo-avatars/charcoal-256.webp", src96: "/velo-avatars/charcoal-96.webp", round: true, voiceId: "kfGEdprt9Oe4pbdP8VTo", voiceName: "Katie" },
  { id: "teal", label: "Teal", src256: "/velo-avatars/teal-256.webp", src96: "/velo-avatars/teal-96.webp", round: true, voiceId: "ZghUpjl7YBiyT1L4X9B7", voiceName: "Alessandra" },
  { id: "classic", label: "Classic", src256: "/velo.png", src96: "/velo.png", round: false, voiceId: "21m00Tcm4TlvDq8ikWAM", voiceName: "Rachel" },
];

export const DEFAULT_VELO_LOOK = "default";
/** user_settings key that holds the chosen look's id. */
export const VELO_LOOK_KEY = "velo_avatar";

export const veloLook = (id?: string | null): VeloLook =>
  VELO_LOOKS.find(l => l.id === id) || VELO_LOOKS[0];
