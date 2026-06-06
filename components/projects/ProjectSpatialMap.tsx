"use client";

/* eslint-disable @next/next/no-img-element */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Eye,
  Layers,
  Loader2,
  MapPin,
  MousePointer2,
  Palette,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "@/lib/supabase/storage-shim";
import { storage, supabase } from "@/lib/backend";
import { getTaskDateValue, isCompletedTaskStatus } from "@/lib/taskProgress";
import { toast } from "sonner";

type GeoJsonGeometry = {
  type: string;
  coordinates?: any;
};

type GeoJsonFeature = {
  type: "Feature";
  geometry: GeoJsonGeometry | null;
  properties?: Record<string, any>;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

type GeoJsonBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type LayerStyleConfig = {
  fillColor?: string;
  strokeColor?: string;
  fillOpacity?: number;
  strokeOpacity?: number;
  strokeWidth?: number;
};

type SpatialLayer = {
  id: string;
  name?: string;
  fileName?: string;
  sourceType?: "geojson" | "shapefile";
  geojson?: GeoJsonFeatureCollection;
  storagePath?: string;
  downloadUrl?: string;
  bounds?: GeoJsonBounds | null;
  featureCount?: number;
  attributes?: string[];
  visible?: boolean;
  styleConfig?: LayerStyleConfig;
  joinConfig?: {
    layerAttribute?: string;
    taskAttribute?: string;
  };
  createdAt?: any;
  updatedAt?: any;
};

type TaskAttributeOption = {
  value: string;
  label: string;
  getValue: (task: any) => any;
};

type ProjectSpatialMapProps = {
  projectId: string;
  project: any;
  tasks: any[];
  teamMembers: any[];
  currentUser: any;
  canManage: boolean;
};

type ProjectedPoint = {
  x: number;
  y: number;
};

type FeatureJoin = {
  feature: GeoJsonFeature;
  key: string;
  tasks: any[];
  sourceIndex: number;
};

type FeatureWithBounds = {
  feature: GeoJsonFeature;
  bounds: GeoJsonBounds;
  sourceIndex: number;
};

type CanvasHitRegion = {
  index: number;
  path: Path2D;
  strokeWidth: number;
  points: Array<{ x: number; y: number; radius: number }>;
};

type SpatialLayerRow = {
  id: string;
  project_id: string;
  name: string;
  file_name?: string | null;
  source_type?: string | null;
  storage_path?: string | null;
  download_url?: string | null;
  bounds?: GeoJsonBounds | null;
  feature_count?: number | null;
  attributes?: string[] | null;
  visible?: boolean | null;
  style_config?: LayerStyleConfig | null;
  join_config?: SpatialLayer["joinConfig"] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const OSM_TILE_URL = "https://tile.openstreetmap.org";
const SHP_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/shpjs@6.1.0/dist/shp.min.js";
const SPATIAL_LAYERS_TABLE = "project_spatial_layers";
const TILE_SIZE = 256;
const MIN_ZOOM = 3;
const MAX_ZOOM = 18;
const MAX_RENDER_FEATURES = 20000;
const VIEWPORT_BOUNDS_PADDING_RATIO = 0.18;
const DEFAULT_LAYER_STYLE: Required<LayerStyleConfig> = {
  fillColor: "#64748b",
  strokeColor: "#475569",
  fillOpacity: 0.18,
  strokeOpacity: 0.74,
  strokeWidth: 1.2,
};
const LAYER_COLOR_PRESETS = ["#64748b", "#0ea5e9", "#10b981", "#f97316", "#8b5cf6", "#ef4444", "#f59e0b", "#111827"];

const statusMeta: Record<string, { label: string; color: string; fill: string; border: string }> = {
  todo: { label: "Pendiente", color: "#64748b", fill: "rgba(100,116,139,.18)", border: "#64748b" },
  pending: { label: "Pendiente", color: "#64748b", fill: "rgba(100,116,139,.18)", border: "#64748b" },
  not_started: { label: "No iniciado", color: "#94a3b8", fill: "rgba(148,163,184,.16)", border: "#94a3b8" },
  in_progress: { label: "Trabajando", color: "#f97316", fill: "rgba(249,115,22,.24)", border: "#f97316" },
  trabajando: { label: "Trabajando", color: "#f97316", fill: "rgba(249,115,22,.24)", border: "#f97316" },
  completed: { label: "Finalizada", color: "#10b981", fill: "rgba(16,185,129,.24)", border: "#10b981" },
  completed_late: { label: "Finalizada con retraso", color: "#c2410c", fill: "rgba(194,65,12,.24)", border: "#c2410c" },
  listo: { label: "Finalizada", color: "#10b981", fill: "rgba(16,185,129,.24)", border: "#10b981" },
  stuck: { label: "Estancada", color: "#ef4444", fill: "rgba(239,68,68,.28)", border: "#ef4444" },
  estancada: { label: "Estancada", color: "#ef4444", fill: "rgba(239,68,68,.28)", border: "#ef4444" },
};

const normalizeKey = (value: any) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const clampNumber = (value: any, min: number, max: number, fallback: number) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(max, Math.max(min, numericValue));
};

const normalizeLayerStyle = (style?: LayerStyleConfig | null): Required<LayerStyleConfig> => ({
  fillColor: style?.fillColor || DEFAULT_LAYER_STYLE.fillColor,
  strokeColor: style?.strokeColor || style?.fillColor || DEFAULT_LAYER_STYLE.strokeColor,
  fillOpacity: clampNumber(style?.fillOpacity, 0.04, 0.8, DEFAULT_LAYER_STYLE.fillOpacity),
  strokeOpacity: clampNumber(style?.strokeOpacity, 0.1, 1, DEFAULT_LAYER_STYLE.strokeOpacity),
  strokeWidth: clampNumber(style?.strokeWidth, 0.5, 6, DEFAULT_LAYER_STYLE.strokeWidth),
});

const colorToRgba = (color: string, opacity: number) => {
  const normalized = color.replace("#", "");
  const fullHex = normalized.length === 3
    ? normalized.split("").map((char) => `${char}${char}`).join("")
    : normalized;
  const value = Number.parseInt(fullHex, 16);
  if (!Number.isFinite(value)) return `rgba(100,116,139,${opacity})`;
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red},${green},${blue},${opacity})`;
};

const safeFilePart = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase() || "layer";

const makeSpatialLayerStoragePath = (projectId: string, fileName: string) => {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `projects/${projectId}/spatial-layers/${suffix}-${safeFilePart(fileName.replace(/\.[^.]+$/, ""))}.geojson`;
};

const makeGeoJsonFile = (geojson: GeoJsonFeatureCollection, fileName: string) => {
  const blob = new Blob([JSON.stringify(geojson)], { type: "application/geo+json" });
  return new File([blob], `${safeFilePart(fileName.replace(/\.[^.]+$/, ""))}.geojson`, { type: "application/geo+json" });
};

const mapSpatialLayerRow = (row: SpatialLayerRow): SpatialLayer => ({
  id: row.id,
  name: row.name,
  fileName: row.file_name || undefined,
  sourceType: row.source_type === "shapefile" ? "shapefile" : "geojson",
  storagePath: row.storage_path || undefined,
  downloadUrl: row.download_url || undefined,
  bounds: row.bounds || null,
  featureCount: Number(row.feature_count || 0),
  attributes: Array.isArray(row.attributes) ? row.attributes : [],
  visible: row.visible !== false,
  styleConfig: normalizeLayerStyle(row.style_config),
  joinConfig: row.join_config || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const getTaskTitle = (task: any) => task?.title || task?.name || task?.externalWorkflowId || "Tarea";

const getTaskStatus = (task: any) => String(task?.status || "todo").toLowerCase();

const getStatusMeta = (task: any) => statusMeta[getTaskStatus(task)] || statusMeta.todo;

const getMemberName = (memberById: Map<string, any>, memberId?: string) => {
  if (!memberId) return "Sin responsable";
  const member = memberById.get(memberId);
  return member?.name || member?.displayName || member?.email || "Sin responsable";
};

const formatDate = (value: any) => {
  const date = getTaskDateValue(value);
  if (!date) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short" }).format(date);
};

const getScheduleState = (task: any) => {
  if (isCompletedTaskStatus(task?.status)) return { label: "Cerrada", className: "bg-emerald-50 text-emerald-700" };
  const dueDate = getTaskDateValue(task?.endDate || task?.end);
  if (!dueDate) return { label: "Sin fecha", className: "bg-slate-100 text-slate-600" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const remainingDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);

  if (remainingDays < 0) return { label: "Atrasada", className: "bg-red-50 text-red-700" };
  if (remainingDays <= 3) return { label: "Por vencer", className: "bg-orange-50 text-orange-700" };
  return { label: "A tiempo", className: "bg-emerald-50 text-emerald-700" };
};

const taskAttributeOptions: TaskAttributeOption[] = [
  { value: "externalWorkflowId", label: "ID de workflow / iteración", getValue: (task) => task.externalWorkflowId },
  { value: "id", label: "ID interno de tarea", getValue: (task) => task.id },
  { value: "title", label: "Nombre de la tarea", getValue: (task) => task.title || task.name },
  { value: "municipality", label: "Municipio", getValue: (task) => task.workflowMunicipality || task.municipality || task.municipio },
  { value: "observation", label: "Observación", getValue: (task) => task.observation || task.observacion },
  { value: "spatialKey", label: "Clave espacial personalizada", getValue: (task) => task.spatialKey },
];

const getTaskAttributeValue = (task: any, attribute: string) => {
  const option = taskAttributeOptions.find((item) => item.value === attribute);
  if (option) return option.getValue(task);
  return attribute.split(".").reduce((current: any, key) => (current == null ? undefined : current[key]), task);
};

const normalizeGeoJson = (input: any): GeoJsonFeatureCollection => {
  if (!input) throw new Error("El archivo no contiene geometría.");

  if (input.type === "FeatureCollection" && Array.isArray(input.features)) {
    return {
      type: "FeatureCollection",
      features: input.features.filter((feature: any) => feature?.type === "Feature" && feature.geometry),
    };
  }

  if (input.type === "Feature") {
    return { type: "FeatureCollection", features: [input] };
  }

  if (typeof input === "object") {
    const mergedFeatures = Object.entries(input).flatMap(([sourceLayerName, value]: [string, any]) => {
      const collection = normalizeGeoJson(value);
      return collection.features.map((feature) => ({
        ...feature,
        properties: {
          ...(feature.properties || {}),
          _sourceLayer: sourceLayerName,
        },
      }));
    });

    if (mergedFeatures.length > 0) {
      return { type: "FeatureCollection", features: mergedFeatures };
    }
  }

  throw new Error("No pude leer el formato espacial del archivo.");
};

const extractAttributes = (geojson?: GeoJsonFeatureCollection) => {
  const attributes = new Set<string>();
  (geojson?.features || []).slice(0, 500).forEach((feature) => {
    Object.keys(feature.properties || {}).forEach((key) => attributes.add(key));
  });
  return Array.from(attributes).sort((left, right) => left.localeCompare(right));
};

const getGeoJsonBounds = (geojson?: GeoJsonFeatureCollection): GeoJsonBounds | null => {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  const includeCoordinate = (value: any) => {
    if (!Array.isArray(value) || typeof value[0] !== "number" || typeof value[1] !== "number") return false;
    const lon = value[0];
    const lat = value[1];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return true;
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    return true;
  };

  (geojson?.features || []).forEach((feature) => {
    const coordinates = feature.geometry?.coordinates;
    if (!Array.isArray(coordinates)) return;

    const stack = [coordinates];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!Array.isArray(current) || includeCoordinate(current)) continue;
      for (let index = 0; index < current.length; index += 1) {
        stack.push(current[index]);
      }
    }
  });

  if (!Number.isFinite(west) || !Number.isFinite(south) || !Number.isFinite(east) || !Number.isFinite(north)) {
    return null;
  }

  return { west, south, east, north };
};

const expandBounds = (bounds: GeoJsonBounds, ratio = VIEWPORT_BOUNDS_PADDING_RATIO): GeoJsonBounds => {
  const lonPadding = Math.max((bounds.east - bounds.west) * ratio, 0.0005);
  const latPadding = Math.max((bounds.north - bounds.south) * ratio, 0.0005);
  return {
    west: Math.max(-180, bounds.west - lonPadding),
    south: Math.max(-85.05112878, bounds.south - latPadding),
    east: Math.min(180, bounds.east + lonPadding),
    north: Math.min(85.05112878, bounds.north + latPadding),
  };
};

const boundsIntersect = (left: GeoJsonBounds, right: GeoJsonBounds) =>
  left.west <= right.east &&
  left.east >= right.west &&
  left.south <= right.north &&
  left.north >= right.south;

const projectLonLat = (lon: number, lat: number, zoom: number): ProjectedPoint => {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const safeLat = Math.max(Math.min(lat, 85.05112878), -85.05112878);
  const sin = Math.sin((safeLat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
};

const unprojectPoint = (point: ProjectedPoint, zoom: number) => {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const lon = (point.x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * point.y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lon, lat };
};

const getFittedView = (bounds: ReturnType<typeof getGeoJsonBounds>, width: number, height: number) => {
  if (!bounds || width <= 0 || height <= 0) {
    return { center: { lon: -74.2973, lat: 4.5709 }, zoom: 5 };
  }

  const center = {
    lon: (bounds.west + bounds.east) / 2,
    lat: (bounds.south + bounds.north) / 2,
  };

  let zoom = 5;
  for (let candidateZoom = MAX_ZOOM; candidateZoom >= MIN_ZOOM; candidateZoom -= 1) {
    const nw = projectLonLat(bounds.west, bounds.north, candidateZoom);
    const se = projectLonLat(bounds.east, bounds.south, candidateZoom);
    const projectedWidth = Math.abs(se.x - nw.x);
    const projectedHeight = Math.abs(se.y - nw.y);
    if (projectedWidth <= width * 0.82 && projectedHeight <= height * 0.82) {
      zoom = candidateZoom;
      break;
    }
  }

  return { center, zoom };
};

const getPointCoordinates = (geometry: GeoJsonGeometry | null) => {
  if (!geometry?.coordinates) return [];
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "MultiPoint") return geometry.coordinates;
  return [];
};

const getCanvasSimplificationTolerance = (zoom: number) => {
  if (zoom <= 10) return 6;
  if (zoom <= 12) return 3.5;
  if (zoom <= 14) return 1.8;
  if (zoom <= 16) return 0.9;
  return 0.35;
};

const appendLineToCanvasPath = (
  path: Path2D,
  line: number[][],
  project: (coord: number[]) => ProjectedPoint,
  tolerance: number,
  closePath = false
) => {
  if (!Array.isArray(line) || line.length === 0) return false;

  let started = false;
  let lastX = Number.NaN;
  let lastY = Number.NaN;
  let firstX = Number.NaN;
  let firstY = Number.NaN;
  let pointCount = 0;

  line.forEach((coord, index) => {
    if (!Array.isArray(coord) || typeof coord[0] !== "number" || typeof coord[1] !== "number") return;
    const point = project(coord);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;

    const isLast = index === line.length - 1;
    const hasLastPoint = Number.isFinite(lastX) && Number.isFinite(lastY);
    const shouldKeep =
      !hasLastPoint ||
      isLast ||
      Math.hypot(point.x - lastX, point.y - lastY) >= tolerance;

    if (!shouldKeep) return;

    if (!started) {
      path.moveTo(point.x, point.y);
      firstX = point.x;
      firstY = point.y;
      started = true;
    } else {
      path.lineTo(point.x, point.y);
    }

    lastX = point.x;
    lastY = point.y;
    pointCount += 1;
  });

  if (closePath && started) {
    if (
      Number.isFinite(firstX) &&
      Number.isFinite(firstY) &&
      Number.isFinite(lastX) &&
      Number.isFinite(lastY) &&
      Math.hypot(firstX - lastX, firstY - lastY) >= 0.25
    ) {
      path.lineTo(firstX, firstY);
    }
    path.closePath();
  }

  return pointCount > 1;
};

const appendGeometryToCanvasPath = (
  path: Path2D,
  geometry: GeoJsonGeometry | null,
  project: (coord: number[]) => ProjectedPoint,
  tolerance: number
) => {
  if (!geometry?.coordinates) return { hasFill: false, hasStroke: false };

  if (geometry.type === "Polygon") {
    const hasPath = geometry.coordinates.some((ring: number[][]) => appendLineToCanvasPath(path, ring, project, tolerance, true));
    return { hasFill: hasPath, hasStroke: hasPath };
  }

  if (geometry.type === "MultiPolygon") {
    let hasPath = false;
    geometry.coordinates.forEach((polygon: any) => {
      polygon.forEach((ring: number[][]) => {
        if (appendLineToCanvasPath(path, ring, project, tolerance, true)) hasPath = true;
      });
    });
    return { hasFill: hasPath, hasStroke: hasPath };
  }

  if (geometry.type === "LineString") {
    const hasPath = appendLineToCanvasPath(path, geometry.coordinates, project, tolerance, false);
    return { hasFill: false, hasStroke: hasPath };
  }

  if (geometry.type === "MultiLineString") {
    const hasPath = geometry.coordinates.some((line: number[][]) => appendLineToCanvasPath(path, line, project, tolerance, false));
    return { hasFill: false, hasStroke: hasPath };
  }

  return { hasFill: false, hasStroke: false };
};

const loadShapefileParser = () =>
  new Promise<any>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("El parser espacial solo se carga en navegador."));
      return;
    }

    const currentParser = (window as any).shp;
    if (currentParser) {
      resolve(currentParser);
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${SHP_SCRIPT_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve((window as any).shp), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("No se pudo cargar el parser de shapefile.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = SHP_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const parser = (window as any).shp;
      if (parser) resolve(parser);
      else reject(new Error("El parser de shapefile no quedó disponible."));
    };
    script.onerror = () => reject(new Error("No se pudo cargar el parser de shapefile."));
    document.head.appendChild(script);
  });

const statusCountsFromTasks = (tasks: any[]) => {
  return tasks.reduce(
    (summary, task) => {
      const status = getTaskStatus(task);
      if (isCompletedTaskStatus(status)) summary.completed += 1;
      else if (status === "stuck" || status === "estancada") summary.stuck += 1;
      else if (status === "in_progress" || status === "trabajando") summary.inProgress += 1;
      else summary.pending += 1;
      return summary;
    },
    { pending: 0, inProgress: 0, completed: 0, stuck: 0 }
  );
};

export function ProjectSpatialMap({
  projectId,
  project,
  tasks,
  teamMembers,
  currentUser,
  canManage,
}: ProjectSpatialMapProps) {
  const [layers, setLayers] = useState<SpatialLayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [spatialStoreError, setSpatialStoreError] = useState("");
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [layerGeojsons, setLayerGeojsons] = useState<Record<string, GeoJsonFeatureCollection>>({});
  const [loadingLayerData, setLoadingLayerData] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadDraftFile, setUploadDraftFile] = useState<File | null>(null);
  const [uploadDraftName, setUploadDraftName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [layerEditName, setLayerEditName] = useState("");
  const [layerEditStyle, setLayerEditStyle] = useState<Required<LayerStyleConfig>>(DEFAULT_LAYER_STYLE);
  const [layerEditVisible, setLayerEditVisible] = useState(true);
  const [savingLayerSettings, setSavingLayerSettings] = useState(false);
  const [layerAttribute, setLayerAttribute] = useState("");
  const [taskAttribute, setTaskAttribute] = useState("externalWorkflowId");
  const [customTaskAttribute, setCustomTaskAttribute] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFeatureIndex, setSelectedFeatureIndex] = useState<number | null>(null);
  const [layerPendingDelete, setLayerPendingDelete] = useState<SpatialLayer | null>(null);
  const [mapSize, setMapSize] = useState({ width: 960, height: 560 });
  const [mapView, setMapView] = useState({ center: { lon: -74.2973, lat: 4.5709 }, zoom: 5 });
  const [isDragging, setIsDragging] = useState(false);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hitRegionsRef = useRef<CanvasHitRegion[]>([]);
  const dragRef = useRef<{ x: number; y: number; center: { lon: number; lat: number } } | null>(null);
  const pendingPanCenterRef = useRef<{ lon: number; lat: number } | null>(null);
  const panFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!projectId) return;

    let active = true;

    const loadLayers = async () => {
      const { data, error } = await supabase
        .from(SPATIAL_LAYERS_TABLE)
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (!active) return;

      if (error) {
        console.error("Error loading spatial layers:", error);
        setSpatialStoreError(
          error.code === "42P01"
            ? "Falta aplicar la migración espacial con PostGIS."
            : "No se pudieron cargar las capas espaciales."
        );
        setLayers([]);
        setLoading(false);
        return;
      }

      const nextLayers = ((data || []) as SpatialLayerRow[]).map(mapSpatialLayerRow);
      const nextLayerIds = new Set(nextLayers.map((layer) => layer.id));
      setLayerGeojsons((current) => Object.fromEntries(Object.entries(current).filter(([layerId]) => nextLayerIds.has(layerId))));
      setLayers(nextLayers);
      setSelectedLayerId((current) => {
        if (current && nextLayers.some((layer) => layer.id === current)) return current;
        return nextLayers[0]?.id || "";
      });
      setSpatialStoreError("");
      setLoading(false);
    };

    void loadLayers();

    const channel = supabase
      .channel(`project_spatial_layers_${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: SPATIAL_LAYERS_TABLE,
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          void loadLayers();
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [projectId]);

  useEffect(() => {
    const element = mapRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setMapSize({
        width: Math.max(320, Math.round(entry.contentRect.width)),
        height: Math.max(360, Math.round(entry.contentRect.height)),
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (panFrameRef.current != null) cancelAnimationFrame(panFrameRef.current);
    };
  }, []);

  const selectedLayer = useMemo(
    () => layers.find((layer) => layer.id === selectedLayerId) || null,
    [layers, selectedLayerId]
  );
  const selectedLayerGeojson = selectedLayer ? layerGeojsons[selectedLayer.id] : undefined;

  useEffect(() => {
    if (!selectedLayer) return;
    if (layerGeojsons[selectedLayer.id]) return;
    if (!selectedLayer.downloadUrl) return;

    let active = true;
    setLoadingLayerData(true);

    void (async () => {
      try {
        const response = await fetch(selectedLayer.downloadUrl as string);
        if (!response.ok) throw new Error("No se pudo descargar la geometría desde Storage.");
        const parsed = await response.json();
        const geojson = normalizeGeoJson(parsed);
        if (!active) return;
        setLayerGeojsons((current) => ({ ...current, [selectedLayer.id]: geojson }));
      } catch (error: any) {
        console.error("Error loading layer geojson:", error);
        if (active) toast.error(error?.message || "No se pudo cargar la geometría de la capa.");
      } finally {
        if (active) setLoadingLayerData(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [layerGeojsons, selectedLayer]);

  useEffect(() => {
    if (!selectedLayer) {
      setLayerAttribute("");
      setTaskAttribute("externalWorkflowId");
      setCustomTaskAttribute("");
      setLayerEditName("");
      setLayerEditStyle(DEFAULT_LAYER_STYLE);
      setLayerEditVisible(true);
      setSelectedFeatureIndex(null);
      return;
    }

    const firstAttribute = selectedLayer.attributes?.[0] || "";
    setLayerEditName(selectedLayer.name || selectedLayer.fileName || "");
    setLayerEditStyle(normalizeLayerStyle(selectedLayer.styleConfig));
    setLayerEditVisible(selectedLayer.visible !== false);
    setLayerAttribute(selectedLayer.joinConfig?.layerAttribute || firstAttribute);
    setTaskAttribute(selectedLayer.joinConfig?.taskAttribute || "externalWorkflowId");
    setCustomTaskAttribute(
      selectedLayer.joinConfig?.taskAttribute &&
        !taskAttributeOptions.some((option) => option.value === selectedLayer.joinConfig?.taskAttribute)
        ? selectedLayer.joinConfig.taskAttribute
        : ""
    );
    setSelectedFeatureIndex(null);
  }, [selectedLayer]);

  useEffect(() => {
    const bounds = getGeoJsonBounds(selectedLayerGeojson) || selectedLayer?.bounds || null;
    setMapView(getFittedView(bounds, mapSize.width, mapSize.height));
  }, [mapSize.height, mapSize.width, selectedLayer?.bounds, selectedLayer?.id, selectedLayerGeojson]);

  const memberById = useMemo(() => {
    const map = new Map<string, any>();
    teamMembers.forEach((member) => {
      if (member.id) map.set(member.id, member);
      if (member.authUserId) map.set(member.authUserId, member);
      if (member.uid) map.set(member.uid, member);
    });
    return map;
  }, [teamMembers]);

  const effectiveTaskAttribute = taskAttribute === "__custom__" ? customTaskAttribute.trim() : taskAttribute;

  const tasksByJoinKey = useMemo(() => {
    const map = new Map<string, any[]>();
    tasks.forEach((task) => {
      const rawValue = getTaskAttributeValue(task, effectiveTaskAttribute);
      const key = normalizeKey(rawValue);
      if (!key) return;
      const current = map.get(key) || [];
      current.push(task);
      map.set(key, current);
    });
    return map;
  }, [effectiveTaskAttribute, tasks]);

  const boundedFeatures = useMemo<FeatureWithBounds[]>(() => {
    return (selectedLayerGeojson?.features || []).reduce<FeatureWithBounds[]>((features, feature, sourceIndex) => {
      const bounds = getGeoJsonBounds({ type: "FeatureCollection", features: [feature] });
      if (bounds) features.push({ feature, bounds, sourceIndex });
      return features;
    }, []);
  }, [selectedLayerGeojson]);

  const mapViewportBounds = useMemo(() => {
    if (mapSize.width <= 0 || mapSize.height <= 0) return null;
    const viewportCenterPx = projectLonLat(mapView.center.lon, mapView.center.lat, mapView.zoom);
    const viewportTopLeft = {
      x: viewportCenterPx.x - mapSize.width / 2,
      y: viewportCenterPx.y - mapSize.height / 2,
    };
    const northWest = unprojectPoint(viewportTopLeft, mapView.zoom);
    const southEast = unprojectPoint(
      {
        x: viewportTopLeft.x + mapSize.width,
        y: viewportTopLeft.y + mapSize.height,
      },
      mapView.zoom
    );

    return expandBounds({
      west: Math.min(northWest.lon, southEast.lon),
      south: Math.min(northWest.lat, southEast.lat),
      east: Math.max(northWest.lon, southEast.lon),
      north: Math.max(northWest.lat, southEast.lat),
    });
  }, [mapSize.height, mapSize.width, mapView.center.lat, mapView.center.lon, mapView.zoom]);

  const visibleFeatureWindow = useMemo(() => {
    const features: FeatureWithBounds[] = [];
    let matchedCount = 0;

    if (selectedLayer?.visible === false) return { features, matchedCount };

    boundedFeatures.forEach((item) => {
      if (mapViewportBounds && !boundsIntersect(item.bounds, mapViewportBounds)) return;
      matchedCount += 1;
      if (features.length < MAX_RENDER_FEATURES) features.push(item);
    });

    return { features, matchedCount };
  }, [boundedFeatures, mapViewportBounds, selectedLayer?.visible]);

  const featureJoins = useMemo<FeatureJoin[]>(() => {
    return visibleFeatureWindow.features.map(({ feature, sourceIndex }) => {
      const rawKey = feature.properties?.[layerAttribute];
      const key = normalizeKey(rawKey);
      return {
        feature,
        key: String(rawKey ?? ""),
        tasks: key ? tasksByJoinKey.get(key) || [] : [],
        sourceIndex,
      };
    });
  }, [layerAttribute, tasksByJoinKey, visibleFeatureWindow.features]);

  const filteredFeatureJoins = useMemo(() => {
    const search = normalizeKey(searchTerm);
    if (!search) return featureJoins;
    return featureJoins.filter((item) => {
      const taskMatch = item.tasks.some((task) =>
        [getTaskTitle(task), task.externalWorkflowId, task.municipality, task.workflowMunicipality, task.status]
          .some((value) => normalizeKey(value).includes(search))
      );
      const propertyMatch = Object.values(item.feature.properties || {}).some((value) => normalizeKey(value).includes(search));
      return taskMatch || propertyMatch;
    });
  }, [featureJoins, searchTerm]);

  const spatializedTasks = useMemo(() => {
    const map = new Map<string, any>();
    featureJoins.forEach((join) => {
      join.tasks.forEach((task) => map.set(task.id, task));
    });
    return Array.from(map.values());
  }, [featureJoins]);

  const stats = useMemo(() => {
    const linkedFeatures = featureJoins.filter((join) => join.tasks.length > 0);
    const taskStatusCounts = statusCountsFromTasks(spatializedTasks);
    return {
      features: selectedLayer?.featureCount || featureJoins.length,
      visibleFeatures: visibleFeatureWindow.features.length,
      viewportFeatures: visibleFeatureWindow.matchedCount,
      linkedFeatures: linkedFeatures.length,
      linkedTasks: spatializedTasks.length,
      coverage: featureJoins.length > 0 ? Math.round((linkedFeatures.length / featureJoins.length) * 100) : 0,
      ...taskStatusCounts,
    };
  }, [featureJoins, selectedLayer?.featureCount, spatializedTasks, visibleFeatureWindow.features.length, visibleFeatureWindow.matchedCount]);

  const selectedFeatureJoin = selectedFeatureIndex == null ? null : featureJoins[selectedFeatureIndex] || null;
  const selectedLayerStyle = useMemo(() => normalizeLayerStyle(selectedLayer?.styleConfig), [selectedLayer?.styleConfig]);

  const centerPx = projectLonLat(mapView.center.lon, mapView.center.lat, mapView.zoom);
  const topLeft = {
    x: centerPx.x - mapSize.width / 2,
    y: centerPx.y - mapSize.height / 2,
  };

  const projectCoordinate = useCallback((coord: number[]) => {
    const projected = projectLonLat(Number(coord[0]), Number(coord[1]), mapView.zoom);
    return {
      x: projected.x - topLeft.x,
      y: projected.y - topLeft.y,
    };
  }, [mapView.zoom, topLeft.x, topLeft.y]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const frame = requestAnimationFrame(() => {
      const pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const width = Math.max(1, mapSize.width);
      const height = Math.max(1, mapSize.height);

      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.lineJoin = "round";
      context.lineCap = "round";

      const tolerance = getCanvasSimplificationTolerance(mapView.zoom);
      const hitRegions: CanvasHitRegion[] = [];

      featureJoins.forEach((join, index) => {
        const primaryTask = join.tasks[0];
        const meta = primaryTask ? getStatusMeta(primaryTask) : null;
        const isSelected = selectedFeatureIndex === index;
        const baseStyle = selectedLayerStyle;
        const fillStyle = meta?.fill || colorToRgba(baseStyle.fillColor, baseStyle.fillOpacity);
        const strokeStyle = meta?.border || colorToRgba(baseStyle.strokeColor, baseStyle.strokeOpacity);
        const strokeWidth = isSelected ? Math.max(baseStyle.strokeWidth + 1.8, 3) : baseStyle.strokeWidth;
        const path = new Path2D();
        const drawState = appendGeometryToCanvasPath(path, join.feature.geometry, projectCoordinate, tolerance);
        const points: CanvasHitRegion["points"] = getPointCoordinates(join.feature.geometry)
          .map((coord: number[]) => {
            const point = projectCoordinate(coord);
            return {
              x: point.x,
              y: point.y,
              radius: isSelected ? 7 : 4.5,
            };
          })
          .filter((point: CanvasHitRegion["points"][number]) => Number.isFinite(point.x) && Number.isFinite(point.y));

        context.globalAlpha = 1;
        if (drawState.hasFill) {
          context.fillStyle = fillStyle;
          context.fill(path, "evenodd");
        }

        if (drawState.hasStroke) {
          context.strokeStyle = isSelected ? "#1d4ed8" : strokeStyle;
          context.lineWidth = strokeWidth;
          context.stroke(path);
        }

        points.forEach((point) => {
          context.beginPath();
          context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
          context.fillStyle = meta?.border || baseStyle.strokeColor;
          context.fill();
          context.lineWidth = isSelected ? 2.5 : 1.5;
          context.strokeStyle = "#fff";
          context.stroke();
        });

        if (drawState.hasFill || drawState.hasStroke || points.length > 0) {
          hitRegions.push({ index, path, strokeWidth: Math.max(strokeWidth + 5, 8), points });
        }
      });

      hitRegionsRef.current = hitRegions;
    });

    return () => cancelAnimationFrame(frame);
  }, [
    featureJoins,
    mapSize.height,
    mapSize.width,
    mapView.zoom,
    projectCoordinate,
    selectedFeatureIndex,
    selectedLayerStyle,
  ]);

  const tiles = useMemo(() => {
    const maxTile = Math.pow(2, mapView.zoom);
    const startX = Math.floor(topLeft.x / TILE_SIZE);
    const endX = Math.floor((topLeft.x + mapSize.width) / TILE_SIZE);
    const startY = Math.max(0, Math.floor(topLeft.y / TILE_SIZE));
    const endY = Math.min(maxTile - 1, Math.floor((topLeft.y + mapSize.height) / TILE_SIZE));
    const nextTiles: Array<{ key: string; url: string; left: number; top: number }> = [];

    for (let tileX = startX; tileX <= endX; tileX += 1) {
      for (let tileY = startY; tileY <= endY; tileY += 1) {
        const wrappedX = ((tileX % maxTile) + maxTile) % maxTile;
        nextTiles.push({
          key: `${mapView.zoom}-${tileX}-${tileY}`,
          url: `${OSM_TILE_URL}/${mapView.zoom}/${wrappedX}/${tileY}.png`,
          left: tileX * TILE_SIZE - topLeft.x,
          top: tileY * TILE_SIZE - topLeft.y,
        });
      }
    }

    return nextTiles;
  }, [mapSize.height, mapSize.width, mapView.zoom, topLeft.x, topLeft.y]);

  const handleUploadFile = async (file: File | null, explicitName?: string) => {
    if (!file || !canManage) return false;

    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const sourceType = extension === "zip" ? "shapefile" : "geojson";

    if (!["zip", "geojson", "json"].includes(extension)) {
      toast.warning("Sube un shapefile comprimido .zip o un archivo .geojson.");
      return false;
    }

    const name = (explicitName || file.name.replace(/\.[^.]+$/, "")).trim();
    if (!name) {
      toast.warning("Escribe un nombre para identificar la capa.");
      return false;
    }

    setUploading(true);
    let uploadedStoragePath = "";
    try {
      let parsed: any;
      if (sourceType === "shapefile") {
        const parser = await loadShapefileParser();
        parsed = await parser(await file.arrayBuffer());
      } else {
        parsed = JSON.parse(await file.text());
      }

      const geojson = normalizeGeoJson(parsed);
      if (geojson.features.length === 0) {
        throw new Error("La capa no contiene entidades espaciales.");
      }

      const attributes = extractAttributes(geojson);
      const firstAttribute = attributes[0] || "";
      const bounds = getGeoJsonBounds(geojson);
      const storagePath = makeSpatialLayerStoragePath(projectId, file.name);
      const geoJsonRef = ref(storage, storagePath);
      const styleConfig = normalizeLayerStyle(DEFAULT_LAYER_STYLE);

      await uploadBytes(geoJsonRef, makeGeoJsonFile(geojson, file.name));
      uploadedStoragePath = storagePath;
      const downloadUrl = await getDownloadURL(geoJsonRef);

      const { data, error } = await supabase
        .from(SPATIAL_LAYERS_TABLE)
        .insert({
          project_id: projectId,
          name,
          file_name: file.name,
          source_type: sourceType,
          storage_path: storagePath,
          download_url: downloadUrl,
          attributes,
          bounds,
          visible: true,
          style_config: styleConfig,
          join_config: {
            layerAttribute: firstAttribute,
            taskAttribute: "externalWorkflowId",
          },
          feature_count: geojson.features.length,
          created_by: currentUser?.uid || null,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) {
        if (uploadedStoragePath) {
          await deleteObject(ref(storage, uploadedStoragePath)).catch((storageError) => {
            console.warn("Spatial layer storage cleanup failed after metadata insert error:", storageError);
          });
        }
        throw error;
      }

      const layerId = data?.id;
      if (layerId) {
        setLayerGeojsons((current) => ({ ...current, [layerId]: geojson }));
      }

      setLayers((current) => [
        {
          id: layerId || storagePath,
          name,
          fileName: file.name,
          sourceType,
          storagePath,
          downloadUrl,
          attributes,
          bounds,
          visible: true,
          styleConfig,
          joinConfig: {
            layerAttribute: firstAttribute,
            taskAttribute: "externalWorkflowId",
          },
          featureCount: geojson.features.length,
        },
        ...current,
      ]);

      setSelectedLayerId(layerId || storagePath);
      setIsUploadModalOpen(false);
      setUploadDraftFile(null);
      setUploadDraftName("");
      toast.success(`Capa "${name}" cargada con ${geojson.features.length} entidades.`);
      return true;
    } catch (error: any) {
      console.error("Error uploading spatial layer:", error);
      toast.error(error?.message || "No se pudo procesar la capa espacial.");
      return false;
    } finally {
      setUploading(false);
    }
  };

  const handleSaveJoin = async () => {
    if (!selectedLayer || !canManage) return;
    if (!layerAttribute || !effectiveTaskAttribute) {
      toast.warning("Selecciona el atributo de la capa y el atributo de tarea.");
      return;
    }

    try {
      const joinConfig = {
        layerAttribute,
        taskAttribute: effectiveTaskAttribute,
      };
      const { error } = await supabase
        .from(SPATIAL_LAYERS_TABLE)
        .update({
          join_config: joinConfig,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedLayer.id)
        .eq("project_id", projectId);

      if (error) throw error;

      setLayers((current) =>
        current.map((layer) =>
          layer.id === selectedLayer.id
            ? {
                ...layer,
                joinConfig,
              }
            : layer
        )
      );
      toast.success("Unión espacial guardada.");
    } catch (error) {
      console.error("Error saving spatial join:", error);
      toast.error("No se pudo guardar la unión espacial.");
    }
  };

  const handleSaveLayerSettings = async () => {
    if (!selectedLayer || !canManage) return;
    const nextName = layerEditName.trim();
    if (!nextName) {
      toast.warning("Escribe un nombre para la capa.");
      return;
    }

    const nextStyle = normalizeLayerStyle(layerEditStyle);
    setSavingLayerSettings(true);
    try {
      const { error } = await supabase
        .from(SPATIAL_LAYERS_TABLE)
        .update({
          name: nextName,
          visible: layerEditVisible,
          style_config: nextStyle,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedLayer.id)
        .eq("project_id", projectId);

      if (error) throw error;

      setLayers((current) =>
        current.map((layer) =>
          layer.id === selectedLayer.id
            ? {
                ...layer,
                name: nextName,
                visible: layerEditVisible,
                styleConfig: nextStyle,
              }
            : layer
        )
      );
      toast.success("Capa actualizada.");
    } catch (error) {
      console.error("Error saving spatial layer settings:", error);
      toast.error("No se pudo guardar la configuración de la capa.");
    } finally {
      setSavingLayerSettings(false);
    }
  };

  const handleDeleteLayer = async () => {
    if (!layerPendingDelete || !canManage) return;

    try {
      const { error } = await supabase
        .from(SPATIAL_LAYERS_TABLE)
        .delete()
        .eq("id", layerPendingDelete.id)
        .eq("project_id", projectId);

      if (error) throw error;

      if (layerPendingDelete.storagePath) {
        await deleteObject(ref(storage, layerPendingDelete.storagePath)).catch((storageError) => {
          console.warn("Spatial layer storage object was not deleted:", storageError);
        });
      }

      setLayerGeojsons((current) => {
        const next = { ...current };
        delete next[layerPendingDelete.id];
        return next;
      });
      setLayers((current) => current.filter((layer) => layer.id !== layerPendingDelete.id));
      setLayerPendingDelete(null);
      toast.success("Capa eliminada.");
    } catch (error) {
      console.error("Error deleting spatial layer:", error);
      toast.error("No se pudo eliminar la capa.");
    }
  };

  const setZoom = (nextZoom: number) => {
    setMapView((current) => ({ ...current, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom)) }));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, center: mapView.center };
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const startCenterPx = projectLonLat(dragRef.current.center.lon, dragRef.current.center.lat, mapView.zoom);
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    const nextCenter = unprojectPoint({ x: startCenterPx.x - dx, y: startCenterPx.y - dy }, mapView.zoom);
    pendingPanCenterRef.current = nextCenter;
    if (panFrameRef.current != null) return;
    panFrameRef.current = requestAnimationFrame(() => {
      const pendingCenter = pendingPanCenterRef.current;
      if (pendingCenter) {
        setMapView((current) => ({ ...current, center: pendingCenter }));
      }
      panFrameRef.current = null;
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragRef.current;
    if (pendingPanCenterRef.current) {
      const pendingCenter = pendingPanCenterRef.current;
      setMapView((current) => ({ ...current, center: pendingCenter }));
      pendingPanCenterRef.current = null;
    }
    if (panFrameRef.current != null) {
      cancelAnimationFrame(panFrameRef.current);
      panFrameRef.current = null;
    }
    dragRef.current = null;
    setIsDragging(false);

    if (!dragState) return;
    const movedDistance = Math.hypot(event.clientX - dragState.x, event.clientY - dragState.y);
    if (movedDistance > 6) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const mapElement = mapRef.current;
    if (!canvas || !context || !mapElement) return;

    const rect = mapElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hitRegions = hitRegionsRef.current;

    for (let index = hitRegions.length - 1; index >= 0; index -= 1) {
      const region = hitRegions[index];
      const pointHit = region.points.some((point) => Math.hypot(point.x - x, point.y - y) <= point.radius + 5);
      context.lineWidth = region.strokeWidth;
      if (pointHit || context.isPointInPath(region.path, x, y, "evenodd") || context.isPointInStroke(region.path, x, y)) {
        setSelectedFeatureIndex(region.index);
        return;
      }
    }
  };

  const recenterLayer = () => {
    const bounds = getGeoJsonBounds(selectedLayerGeojson) || selectedLayer?.bounds || null;
    setMapView(getFittedView(bounds, mapSize.width, mapSize.height));
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-emerald-600" />
            <h2 className="text-xl font-black tracking-tight text-slate-900">Mapa operativo</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-500">
            Espacializa tareas del proyecto uniendo capas geográficas con atributos como ID de workflow, municipio o una clave personalizada.
          </p>
        </div>

        {canManage && (
          <Button
            type="button"
            onClick={() => {
              setUploadDraftFile(null);
              setUploadDraftName("");
              setIsUploadModalOpen(true);
            }}
            disabled={uploading}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {uploading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Upload size={16} className="mr-2" />}
            Subir capa
          </Button>
        )}
      </div>

      {spatialStoreError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-black">La base espacial todavía no está lista</p>
              <p className="mt-1">
                {spatialStoreError} Aplica la migración de PostGIS antes de cargar nuevas capas. Mientras tanto, no se guardarán shapefiles dentro de documentos pesados.
              </p>
            </div>
          </div>
        </div>
      )}

      {selectedLayer && !selectedLayer.downloadUrl && !selectedLayerGeojson && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm font-semibold leading-6 text-orange-900">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
            <div>
              <p className="font-black">Capa antigua sin archivo liviano</p>
              <p className="mt-1">
                Esta capa parece venir del almacenamiento anterior. Elimínala y vuelve a cargarla para que quede en Storage y no en la base de datos.
              </p>
            </div>
          </div>
        </div>
      )}

      {selectedLayer && (selectedLayer.featureCount || 0) > MAX_RENDER_FEATURES && (
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm font-semibold leading-6 text-cyan-900">
          <div className="flex gap-3">
            <Database className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" />
            <div>
              <p className="font-black">Capa pesada protegida</p>
              <p className="mt-1">
                Esta capa tiene {selectedLayer.featureCount?.toLocaleString("es-CO")} entidades. El mapa muestra hasta {MAX_RENDER_FEATURES.toLocaleString("es-CO")} entidades que intersectan la ventana visible actual y se recalcula al mover o acercar el mapa. Ahora ves {stats.visibleFeatures.toLocaleString("es-CO")} de {stats.viewportFeatures.toLocaleString("es-CO")} entidades dentro de esta vista.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid flex-1 gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Capa</label>
                <select
                  value={selectedLayerId}
                  onChange={(event) => setSelectedLayerId(event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                >
                  {layers.length === 0 ? (
                    <option value="">Sin capas cargadas</option>
                  ) : (
                    layers.map((layer) => (
                      <option key={layer.id} value={layer.id}>
                        {layer.name || layer.fileName || "Capa sin nombre"}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Atributo capa</label>
                <select
                  value={layerAttribute}
                  onChange={(event) => setLayerAttribute(event.target.value)}
                  disabled={!selectedLayer || !canManage}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100"
                >
                  {(selectedLayer?.attributes || []).length === 0 && <option value="">Sin atributos</option>}
                  {(selectedLayer?.attributes || []).map((attribute) => (
                    <option key={attribute} value={attribute}>
                      {attribute}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Atributo tarea</label>
                <select
                  value={taskAttributeOptions.some((option) => option.value === taskAttribute) ? taskAttribute : "__custom__"}
                  onChange={(event) => {
                    setTaskAttribute(event.target.value);
                    if (event.target.value !== "__custom__") setCustomTaskAttribute("");
                  }}
                  disabled={!selectedLayer || !canManage}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100"
                >
                  {taskAttributeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  <option value="__custom__">Campo personalizado</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={recenterLayer} disabled={!selectedLayer}>
                <RefreshCw size={15} className="mr-2" />
                Centrar
              </Button>
              {canManage && (
                <Button type="button" onClick={handleSaveJoin} disabled={!selectedLayer || !layerAttribute || !effectiveTaskAttribute} className="bg-slate-950 text-white hover:bg-slate-800">
                  <Save size={15} className="mr-2" />
                  Guardar unión
                </Button>
              )}
            </div>
          </div>

          {taskAttribute === "__custom__" && (
            <div className="border-b border-slate-100 bg-white px-4 py-3">
              <label className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                Campo personalizado de tarea
              </label>
              <input
                value={customTaskAttribute}
                onChange={(event) => setCustomTaskAttribute(event.target.value)}
                placeholder="Ej: spatialKey, metadata.codigo_predio"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          )}

          <div className="relative min-h-[560px] bg-slate-100" style={{ height: "min(72vh, 760px)" }}>
            <div
              ref={mapRef}
              className={`absolute inset-0 overflow-hidden ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={(event) => {
                event.preventDefault();
                setZoom(mapView.zoom + (event.deltaY > 0 ? -1 : 1));
              }}
            >
              {tiles.map((tile) => (
                <img
                  key={tile.key}
                  src={tile.url}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute h-64 w-64 select-none"
                  style={{ left: tile.left, top: tile.top }}
                />
              ))}

              <canvas
                ref={canvasRef}
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-label="Capa espacial renderizada"
              />

              {!selectedLayer && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 p-6 text-center backdrop-blur-sm">
                  <div className="max-w-md rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 p-6">
                    <Layers className="mx-auto h-10 w-10 text-emerald-600" />
                    <h3 className="mt-3 text-xl font-black text-slate-900">Carga tu primera capa espacial</h3>
                    <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                      Puedes subir un shapefile comprimido en .zip o un GeoJSON. Luego eliges el atributo para unirlo con tareas.
                    </p>
                  </div>
                </div>
              )}

              {loadingLayerData && selectedLayer && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 p-6 text-center backdrop-blur-sm">
                  <div className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-emerald-600" />
                    Cargando geometría desde Storage...
                  </div>
                </div>
              )}
            </div>

            <div className="absolute left-4 top-4 flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <button type="button" onClick={() => setZoom(mapView.zoom + 1)} className="p-2 text-slate-700 hover:bg-slate-50" aria-label="Acercar">
                <ZoomIn size={18} />
              </button>
              <button type="button" onClick={() => setZoom(mapView.zoom - 1)} className="border-l border-slate-100 p-2 text-slate-700 hover:bg-slate-50" aria-label="Alejar">
                <ZoomOut size={18} />
              </button>
            </div>

            <div className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-500 shadow-sm">
              © OpenStreetMap contributors
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Lectura espacial</p>
                <h3 className="mt-1 text-lg font-black text-slate-900">{selectedLayer?.name || "Sin capa activa"}</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{stats.coverage}% unión</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                ["Totales", stats.features, "bg-slate-50 text-slate-700"],
                ["En mapa", stats.visibleFeatures, "bg-cyan-50 text-cyan-700"],
                ["Vinculadas", stats.linkedFeatures, "bg-emerald-50 text-emerald-700"],
                ["Tareas", stats.linkedTasks, "bg-indigo-50 text-indigo-700"],
                ["Trabajando", stats.inProgress, "bg-orange-50 text-orange-700"],
                ["Finalizadas", stats.completed, "bg-emerald-50 text-emerald-700"],
                ["Estancadas", stats.stuck, "bg-red-50 text-red-700"],
              ].map(([label, value, className]) => (
                <div key={String(label)} className={`rounded-xl p-3 ${className}`}>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">{label}</p>
                  <p className="mt-1 text-2xl font-black">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                <Database size={14} />
                Unión activa
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
                <span className="font-black text-slate-900">{layerAttribute || "atributo capa"}</span>
                <span> se compara con </span>
                <span className="font-black text-slate-900">{effectiveTaskAttribute || "atributo tarea"}</span>
                <span> en {tasks.length} tareas del proyecto.</span>
              </div>
            </div>
          </div>

          {canManage && selectedLayer && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Settings2 size={16} className="text-indigo-600" />
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Gestionar capa</p>
              </div>

              <label className="mt-4 block text-xs font-black uppercase tracking-[0.16em] text-slate-400">Nombre</label>
              <input
                value={layerEditName}
                onChange={(event) => setLayerEditName(event.target.value)}
                placeholder="Ej: Predios operativos"
                className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />

              <div className="mt-4">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                  <Palette size={14} />
                  Estilo visual
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {LAYER_COLOR_PRESETS.map((color) => {
                    const isActive = layerEditStyle.fillColor.toLowerCase() === color.toLowerCase();
                    return (
                      <button
                        type="button"
                        key={color}
                        title={`Usar color ${color}`}
                        onClick={() => setLayerEditStyle((current) => ({ ...current, fillColor: color, strokeColor: color }))}
                        className={`h-8 w-8 rounded-full border-2 shadow-sm transition ${
                          isActive ? "border-slate-950 ring-2 ring-slate-950/10" : "border-white hover:scale-105"
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Usar color ${color}`}
                      />
                    );
                  })}
                  <input
                    type="color"
                    value={layerEditStyle.fillColor}
                    onChange={(event) =>
                      setLayerEditStyle((current) => ({
                        ...current,
                        fillColor: event.target.value,
                        strokeColor: event.target.value,
                      }))
                    }
                    className="h-8 w-10 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
                    aria-label="Color personalizado"
                  />
                </div>
              </div>

              <label className="mt-4 block text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Opacidad {Math.round(layerEditStyle.fillOpacity * 100)}%
              </label>
              <input
                type="range"
                min={0.04}
                max={0.8}
                step={0.02}
                value={layerEditStyle.fillOpacity}
                onChange={(event) =>
                  setLayerEditStyle((current) => ({
                    ...current,
                    fillOpacity: Number(event.target.value),
                    strokeOpacity: Math.min(1, Math.max(0.35, Number(event.target.value) + 0.45)),
                  }))
                }
                className="mt-2 w-full accent-emerald-600"
              />

              <label className="mt-4 block text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Borde {layerEditStyle.strokeWidth.toFixed(1)} px
              </label>
              <input
                type="range"
                min={0.5}
                max={6}
                step={0.1}
                value={layerEditStyle.strokeWidth}
                onChange={(event) =>
                  setLayerEditStyle((current) => ({
                    ...current,
                    strokeWidth: Number(event.target.value),
                  }))
                }
                className="mt-2 w-full accent-indigo-600"
              />

              <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                Mostrar capa en el mapa
                <input
                  type="checkbox"
                  checked={layerEditVisible}
                  onChange={(event) => setLayerEditVisible(event.target.checked)}
                  className="h-5 w-5 accent-emerald-600"
                />
              </label>

              <div className="mt-4 grid gap-2">
                <Button
                  type="button"
                  onClick={handleSaveLayerSettings}
                  disabled={savingLayerSettings}
                  className="bg-slate-950 text-white hover:bg-slate-800"
                >
                  {savingLayerSettings ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Save size={15} className="mr-2" />}
                  Guardar estilo
                </Button>
                <Button type="button" variant="outline" onClick={() => setLayerPendingDelete(selectedLayer)} className="border-red-100 text-red-700 hover:bg-red-50">
                  <Trash2 size={15} className="mr-2" />
                  Eliminar capa
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-center gap-2">
                <Search size={16} className="text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar predio, municipio, tarea..."
                  className="h-9 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
                />
                {searchTerm && (
                  <button type="button" onClick={() => setSearchTerm("")} className="text-slate-400 hover:text-slate-600">
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center p-8 text-sm font-semibold text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cargando capas...
                </div>
              ) : filteredFeatureJoins.length === 0 ? (
                <div className="p-6 text-center text-sm font-semibold text-slate-500">
                  {selectedLayer ? "No hay entidades que coincidan con la búsqueda." : "No hay capa seleccionada."}
                </div>
              ) : (
                filteredFeatureJoins.slice(0, 80).map((join) => {
                  const originalIndex = featureJoins.indexOf(join);
                  const primaryTask = join.tasks[0];
                  const meta = primaryTask ? getStatusMeta(primaryTask) : statusMeta.todo;
                  const schedule = primaryTask ? getScheduleState(primaryTask) : null;

                  return (
                    <button
                      type="button"
                      key={`${join.key}-${originalIndex}`}
                      onClick={() => setSelectedFeatureIndex(originalIndex)}
                      className={`block w-full border-b border-slate-100 p-3 text-left transition hover:bg-slate-50 ${
                        selectedFeatureIndex === originalIndex ? "bg-emerald-50" : "bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black uppercase tracking-[0.14em]" style={{ color: meta.color }}>
                            {join.key || "Sin clave"}
                          </p>
                          <p className="mt-1 truncate text-sm font-black text-slate-900">
                            {primaryTask ? getTaskTitle(primaryTask) : "Sin tarea vinculada"}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-black text-white" style={{ backgroundColor: meta.color }}>
                          {primaryTask ? meta.label : "Libre"}
                        </span>
                      </div>
                      {primaryTask && (
                        <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em]">
                          {schedule && <span className={`rounded-full px-2 py-1 ${schedule.className}`}>{schedule.label}</span>}
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                            {getMemberName(memberById, primaryTask.assignedTo)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                            Cierre {formatDate(primaryTask.endDate || primaryTask.end)}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      </div>

      {selectedFeatureJoin && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Entidad seleccionada</p>
              <h3 className="mt-1 text-xl font-black text-slate-900">{selectedFeatureJoin.key || "Sin clave"}</h3>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.12em]">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                {selectedFeatureJoin.tasks.length} tareas vinculadas
              </span>
              {selectedFeatureJoin.tasks.length === 0 && (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                  <AlertTriangle size={13} className="mr-1" />
                  Sin coincidencia
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-3">
              {selectedFeatureJoin.tasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
                  Esta geometría no encontró tarea con la unión actual. Revisa que el valor de la capa y el atributo de tarea sean equivalentes.
                </div>
              ) : (
                selectedFeatureJoin.tasks.map((task) => {
                  const meta = getStatusMeta(task);
                  const schedule = getScheduleState(task);
                  return (
                    <div key={task.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full px-2.5 py-1 text-xs font-black text-white" style={{ backgroundColor: meta.color }}>
                              {meta.label}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-black ${schedule.className}`}>{schedule.label}</span>
                          </div>
                          <h4 className="mt-2 text-lg font-black text-slate-900">{getTaskTitle(task)}</h4>
                          <p className="mt-1 text-sm font-semibold text-slate-500">
                            {task.externalWorkflowId ? `${task.externalWorkflowId} · ` : ""}
                            {task.workflowMunicipality || task.municipality || project?.name || "Proyecto"}
                          </p>
                        </div>
                        <a
                          href={`/projects/${projectId}?tab=tasks&taskId=${encodeURIComponent(task.id)}&focus=comments`}
                          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-indigo-100 px-3 py-2 text-sm font-bold text-indigo-700 transition hover:bg-indigo-50"
                        >
                          <Eye size={15} className="mr-2" />
                          Ver tarea
                        </a>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-500 sm:grid-cols-3">
                        <span>Responsable: {getMemberName(memberById, task.assignedTo)}</span>
                        <span>Inicio: {formatDate(task.startDate || task.start)}</span>
                        <span>Cierre: {formatDate(task.endDate || task.end)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                <MousePointer2 size={14} />
                Atributos de capa
              </div>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                {Object.entries(selectedFeatureJoin.feature.properties || {}).map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-white p-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{key}</p>
                    <p className="mt-1 break-words text-xs font-bold text-slate-700">{String(value ?? "")}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <h3 className="text-sm font-black text-emerald-900">Cómo usar el mapa operativo</h3>
            <p className="mt-1 text-sm font-semibold leading-6 text-emerald-800">
              Sube una capa, elige el atributo geográfico que contiene el ID o municipio, y únelo con el atributo equivalente de las tareas. Las geometrías se pintan con el estado de las tareas vinculadas.
            </p>
          </div>
        </div>
      </div>

      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <form
            className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              void handleUploadFile(uploadDraftFile, uploadDraftName);
            }}
          >
            <div className="border-b border-slate-100 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                    <Upload size={14} />
                    Nueva capa espacial
                  </div>
                  <h3 className="text-xl font-black text-slate-900">Subir capa al mapa</h3>
                  <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
                    Dale un nombre operativo antes de cargarla. Ese nombre aparecerá en el selector y en los reportes espaciales.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (uploading) return;
                    setIsUploadModalOpen(false);
                    setUploadDraftFile(null);
                    setUploadDraftName("");
                  }}
                  className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="space-y-4 bg-slate-50 p-5">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-slate-400">Nombre de la capa</label>
                <input
                  value={uploadDraftName}
                  onChange={(event) => setUploadDraftName(event.target.value)}
                  placeholder="Ej: Predios operativos, Barrios, Manzanas"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-slate-400">Archivo espacial</label>
                <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-300 bg-white px-5 py-6 text-center transition hover:border-emerald-500 hover:bg-emerald-50/40">
                  <Upload className="h-8 w-8 text-emerald-600" />
                  <span className="mt-3 text-sm font-black text-slate-900">
                    {uploadDraftFile ? uploadDraftFile.name : "Seleccionar shapefile .zip o GeoJSON"}
                  </span>
                  <span className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                    Para shapefile sube un .zip con .shp, .shx, .dbf y, si existe, .prj.
                  </span>
                  <input
                    type="file"
                    accept=".zip,.geojson,.json,application/geo+json,application/json"
                    className="hidden"
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      setUploadDraftFile(file);
                      if (file && !uploadDraftName.trim()) setUploadDraftName(file.name.replace(/\.[^.]+$/, ""));
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-xs font-semibold leading-5 text-cyan-800">
                El archivo se normaliza a GeoJSON liviano en Storage. La base guarda solo metadatos, estilos y la unión con tareas para proteger el rendimiento.
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 p-5">
              <Button
                type="button"
                variant="outline"
                disabled={uploading}
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setUploadDraftFile(null);
                  setUploadDraftName("");
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={uploading || !uploadDraftFile || !uploadDraftName.trim()} className="bg-emerald-600 text-white hover:bg-emerald-700">
                {uploading ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Upload size={15} className="mr-2" />}
                Subir capa
              </Button>
            </div>
          </form>
        </div>
      )}

      {layerPendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-red-700">
                    <Trash2 size={14} />
                    Eliminar capa
                  </div>
                  <h3 className="text-xl font-black text-slate-900">{layerPendingDelete.name || "Capa espacial"}</h3>
                  <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
                    Esta acción quitará la capa del proyecto y sus uniones espaciales guardadas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLayerPendingDelete(null)}
                  className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="bg-slate-50 p-5">
              <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-800">
                Si necesitas conservar la capa para análisis histórico, cancela y deja la capa cargada. No se eliminarán tareas del proyecto.
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 p-5">
              <Button type="button" variant="outline" onClick={() => setLayerPendingDelete(null)}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleDeleteLayer} className="bg-red-600 text-white hover:bg-red-700">
                Eliminar capa
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
