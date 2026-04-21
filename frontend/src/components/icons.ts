/**
 * Centralized icon surface.
 *
 * Single import point for all icons used across the app. Backed by lucide-react
 * (consistent stroke, visual grammar, tree-shaken). Named with Icon* prefix to
 * make imports read clearly in call sites.
 *
 * When adding new icons:
 *   1. Find the right lucide glyph at https://lucide.dev/icons
 *   2. Re-export here with semantic name (IconBack, not IconArrowLeft)
 *   3. Keep sizes consistent per zone (see below)
 *
 * Size conventions:
 *   - Header action buttons (back, primary actions):  20
 *   - Section panel buttons (edit, save, cancel):      14-16
 *   - Inline indicators (chevrons, status):            14-16
 *   - Micro indicators (badges, tight spots):          10-12
 *   - Lucide default (when unspecified):               24
 */

export {
  // Navigation
  ChevronLeft as IconBack,
  ChevronDown as IconChevronDown,
  ChevronUp as IconChevronUp,
  ChevronRight as IconChevronRight,

  // Actions (CRUD)
  Pencil as IconEdit,
  Check as IconSave,
  X as IconCancel,
  Plus as IconAdd,
  Trash2 as IconDelete,

  // External
  ExternalLink as IconExternalLink,
  Link as IconLink,

  // State / status
  Loader2 as IconLoader,
  AlertCircle as IconAlert,
  Info as IconInfo,
  CheckCircle2 as IconCheckCircle,

  // Search / filter
  Search as IconSearch,
  Filter as IconFilter,

  // Meeting-specific
  Calendar as IconCalendar,
  Clock as IconClock,
  Users as IconUsers,
  Video as IconVideo,
  Phone as IconPhone,
  Mail as IconMail,

  // Content / layout
  Type as IconTextSize,
  Copy as IconCopy,
  Download as IconDownload,
  Upload as IconUpload,
} from "lucide-react";
