import {
  faUser,
  faMoon,
  faStar,
  faCloud,
  faCloudMoon,
  faSun,
  faFeather,
  faBed,
  faEye,
  faSeedling,
  faMountain,
  faRainbow,
  faBolt,
  faCompass,
  faRocket,
  faTree,
  faWater,
  faGhost,
  faHeart,
  faLeaf,
  faMagic
} from '@fortawesome/free-solid-svg-icons';

export const AVATAR_ICONS = [
  { id: 'moon', icon: faMoon, label: 'Moonrise' },
  { id: 'star', icon: faStar, label: 'Starlight' },
  { id: 'cloud', icon: faCloud, label: 'Cloud Drift' },
  { id: 'cloud-moon', icon: faCloudMoon, label: 'Night Cloud' },
  { id: 'sun', icon: faSun, label: 'Sunrise' },
  { id: 'feather', icon: faFeather, label: 'Feather' },
  { id: 'bed', icon: faBed, label: 'Bed' },
  { id: 'eye', icon: faEye, label: 'Inner Eye' },
  { id: 'seedling', icon: faSeedling, label: 'Seedling' },
  { id: 'mountain', icon: faMountain, label: 'Summit' },
  { id: 'rainbow', icon: faRainbow, label: 'Rainbow' },
  { id: 'bolt', icon: faBolt, label: 'Spark' },
  { id: 'compass', icon: faCompass, label: 'Compass' },
  { id: 'rocket', icon: faRocket, label: 'Rocket' },
  { id: 'tree', icon: faTree, label: 'Grove' },
  { id: 'water', icon: faWater, label: 'Tide' },
  { id: 'ghost', icon: faGhost, label: 'Spirit' },
  { id: 'heart', icon: faHeart, label: 'Heart' },
  { id: 'leaf', icon: faLeaf, label: 'Leaf' },
  { id: 'magic', icon: faMagic, label: 'Wand' }
];

export const AVATAR_BACKGROUNDS = ['#081427', '#0f1b2c', '#1f2a44', '#2e0f2c', '#301b35', '#142c24', '#1c1c38', '#2e1b14', '#062019', '#1b2338'];
export const AVATAR_COLORS = ['#fef9c3', '#ffe5ec', '#c7d2fe', '#e0e7ff', '#bbf7d0', '#bae6fd', '#f0abfc', '#fbcfe8', '#fdba74', '#a5f3fc'];

export const DEFAULT_AVATAR_ICON = faUser;
export const DEFAULT_AVATAR_BACKGROUND = AVATAR_BACKGROUNDS[0];
export const DEFAULT_AVATAR_COLOR = AVATAR_COLORS[0];

export const getAvatarIconById = (iconId) => {
  if (!iconId) return DEFAULT_AVATAR_ICON;
  return AVATAR_ICONS.find((entry) => entry.id === iconId)?.icon || DEFAULT_AVATAR_ICON;
};
