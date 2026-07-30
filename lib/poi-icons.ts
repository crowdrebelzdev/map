import type { CSSProperties } from "react";
import {
  MapPin,
  Utensils,
  Coffee,
  ShoppingBag,
  ParkingCircle,
  DoorOpen,
  DoorClosed,
  Info,
  Music,
  Camera,
  Wifi,
  Phone,
  Cross,
  ShieldAlert,
  Siren,
  Tent,
  Users,
  Ticket,
  Beer,
  IceCreamCone,
  Baby,
  Accessibility,
  Bus,
  Bike,
  Car,
  Fuel,
  Flame,
  Droplet,
  Trash2,
  Recycle,
  Stethoscope,
  Building2,
  Landmark,
  Trophy,
  Flag,
  Star,
  Home,
  Store,
  Anchor,
  Waves,
  TreePine,
  Mic2,
  Radio,
  Wrench,
  Key,
  Lock,
  Eye,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

export type PoiIconOption = { value: string; label: string; Icon: LucideIcon };

/** Curated subset of lucide-react icons relevant to event/venue POIs — kept as one
 * source of truth so the category-editor picker and the map rendering never drift. */
export const POI_ICON_OPTIONS: PoiIconOption[] = [
  { value: "MapPin", label: "Locatie", Icon: MapPin },
  { value: "Utensils", label: "Eten", Icon: Utensils },
  { value: "Coffee", label: "Koffie/bar", Icon: Coffee },
  { value: "Beer", label: "Drank", Icon: Beer },
  { value: "IceCreamCone", label: "Snoep/ijs", Icon: IceCreamCone },
  { value: "ShoppingBag", label: "Winkel/kraam", Icon: ShoppingBag },
  { value: "Store", label: "Stand", Icon: Store },
  { value: "Ticket", label: "Kassa/tickets", Icon: Ticket },
  { value: "ParkingCircle", label: "Parkeren", Icon: ParkingCircle },
  { value: "Car", label: "Auto", Icon: Car },
  { value: "Bus", label: "Bus/shuttle", Icon: Bus },
  { value: "Bike", label: "Fiets", Icon: Bike },
  { value: "Fuel", label: "Brandstof", Icon: Fuel },
  { value: "DoorOpen", label: "Ingang", Icon: DoorOpen },
  { value: "DoorClosed", label: "Uitgang", Icon: DoorClosed },
  { value: "Info", label: "Informatie", Icon: Info },
  { value: "Cross", label: "EHBO", Icon: Cross },
  { value: "Stethoscope", label: "Medisch", Icon: Stethoscope },
  { value: "ShieldAlert", label: "Beveiliging", Icon: ShieldAlert },
  { value: "Siren", label: "Alarm/nood", Icon: Siren },
  { value: "AlertTriangle", label: "Gevaar", Icon: AlertTriangle },
  { value: "Flame", label: "Brand", Icon: Flame },
  { value: "Accessibility", label: "Mindervaliden", Icon: Accessibility },
  { value: "Baby", label: "Baby/kind", Icon: Baby },
  { value: "Users", label: "Team/crew", Icon: Users },
  { value: "Tent", label: "Tent/paviljoen", Icon: Tent },
  { value: "Music", label: "Muziek/podium", Icon: Music },
  { value: "Mic2", label: "Optreden", Icon: Mic2 },
  { value: "Radio", label: "Communicatie", Icon: Radio },
  { value: "Camera", label: "Media/pers", Icon: Camera },
  { value: "Wifi", label: "Wifi", Icon: Wifi },
  { value: "Phone", label: "Telefoon", Icon: Phone },
  { value: "Droplet", label: "Water/toilet", Icon: Droplet },
  { value: "Trash2", label: "Afval", Icon: Trash2 },
  { value: "Recycle", label: "Recycling", Icon: Recycle },
  { value: "Building2", label: "Gebouw", Icon: Building2 },
  { value: "Home", label: "Basis/HQ", Icon: Home },
  { value: "Landmark", label: "Podium/monument", Icon: Landmark },
  { value: "Trophy", label: "Prijsuitreiking", Icon: Trophy },
  { value: "Flag", label: "Finish/vlag", Icon: Flag },
  { value: "Star", label: "Bijzonder", Icon: Star },
  { value: "Anchor", label: "Haven", Icon: Anchor },
  { value: "Waves", label: "Water", Icon: Waves },
  { value: "TreePine", label: "Natuur", Icon: TreePine },
  { value: "Wrench", label: "Techniek/onderhoud", Icon: Wrench },
  { value: "Key", label: "Toegang", Icon: Key },
  { value: "Lock", label: "Afgesloten", Icon: Lock },
  { value: "Eye", label: "Uitkijkpunt", Icon: Eye },
];

const iconByValue = new Map(POI_ICON_OPTIONS.map((o) => [o.value, o.Icon]));

/** Resolves a stored icon name to its component, or null for "geen icoon"/unknown values. */
export function getPoiIcon(name: string | null | undefined): LucideIcon | null {
  if (!name) return null;
  return iconByValue.get(name) ?? null;
}

export const POI_SHAPE_OPTIONS: { value: string; label: string }[] = [
  { value: "circle", label: "Rond" },
  { value: "square", label: "Vierkant" },
  { value: "pin", label: "Druppel/pin" },
  { value: "diamond", label: "Ruit" },
  { value: "triangle", label: "Driehoek" },
];

/** CSS for the shape's background container — shared by the category-editor preview
 * and the actual map markers so they never visually drift apart. `triangle` can't use
 * border-radius/background the normal way, so it's built from a clip-path instead. */
export function getShapeContainerStyle(shape: string, color: string, sizePx: number): CSSProperties {
  const base: CSSProperties = {
    width: sizePx,
    height: sizePx,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
  };
  switch (shape) {
    case "square":
      return { ...base, background: color, border: "2px solid white", borderRadius: sizePx * 0.18 };
    case "pin":
      return {
        ...base,
        background: color,
        border: "2px solid white",
        borderRadius: "50% 50% 50% 0",
        transform: "rotate(-45deg)",
      };
    case "diamond":
      return {
        ...base,
        background: color,
        border: "2px solid white",
        borderRadius: sizePx * 0.12,
        transform: "rotate(45deg)",
      };
    case "triangle":
      return {
        ...base,
        background: color,
        clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
      };
    case "circle":
    default:
      return { ...base, background: color, border: "2px solid white", borderRadius: "50%" };
  }
}

/** Counter-rotation for icon/text content placed inside a rotated shape (pin/diamond)
 * so the icon itself stays upright instead of rotating with the background. */
export function getShapeContentCounterRotation(shape: string): CSSProperties {
  if (shape === "pin") return { transform: "rotate(45deg)" };
  if (shape === "diamond") return { transform: "rotate(-45deg)" };
  return {};
}
