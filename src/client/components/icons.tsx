import React from "react";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

// Premium Unicons by IconScout
// Open Source Vector Icons designed for rich modern web interfaces

export const IconRoll: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V5H19V19Z" fill="currentColor" />
    <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <circle cx="16.5" cy="16.5" r="1.5" fill="currentColor" />
  </svg>
);

export const IconBuild: React.FC<IconProps> = ({ size = 16, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M19.4 13C18.8 12.8 18.2 13 17.8 13.5L15 17L11.5 13.5L15 10.7C15.5 10.3 15.7 9.7 15.5 9.1C15.3 8.5 14.8 8.1 14.2 8C13 7.8 11.8 8 10.8 8.6L14 11.8L8.7 17.1L4.8 13.2C4.4 12.8 3.8 12.8 3.4 13.2C3 13.6 3 14.2 3.4 14.6L8 19.2C8.2 19.4 8.5 19.5 8.7 19.5C9 19.5 9.2 19.4 9.4 19.2L15.3 13.3L18.4 16.4C19 15.4 19.2 14.2 19 13ZM21 4H3C2.4 4 2 4.4 2 5V7C2 7.6 2.4 8 3 8H21C21.6 8 22 7.6 22 7V5C22 4.4 21.6 4 21 4Z" fill="currentColor" />
  </svg>
);

export const IconSell: React.FC<IconProps> = ({ size = 16, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M19 13L13.7 18.3C13.3 18.7 12.7 18.7 12.3 18.3L8.5 14.5L3.7 19.3C3.3 19.7 2.7 19.7 2.3 19.3C1.9 18.9 1.9 18.3 2.3 17.9L7.8 12.4C8.2 12 8.8 12 9.2 12.4L13 16.2L17.6 11.6H15C14.4 11.6 14 11.2 14 10.6C14 10 14.4 9.6 15 9.6H20C20.6 9.6 21 10 21 10.6V15.6C21 16.2 20.6 16.6 20 16.6C19.4 16.6 19 16.2 19 15.6V13Z" fill="currentColor" />
  </svg>
);

export const IconMortgage: React.FC<IconProps> = ({ size = 16, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M17 9H16V7C16 4.8 14.2 3 12 3C9.8 3 8 4.8 8 7V9H7C5.9 9 5 9.9 5 11V20C5 21.1 5.9 22 7 22H17C18.1 22 19 21.1 19 20V11C19 9.9 18.1 9 17 9ZM10 7C10 5.9 10.9 5 12 5C13.1 5 14 5.9 14 7V9H10V7ZM17 20H7V11H17V20ZM12 17C12.8 17 13.5 16.3 13.5 15.5C13.5 14.7 12.8 14 12 14C11.2 14 10.5 14.7 10.5 15.5C10.5 16.3 11.2 17 12 17Z" fill="currentColor" />
  </svg>
);

export const IconUnmortgage: React.FC<IconProps> = ({ size = 16, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M17 9H10V7C10 5.9 10.9 5 12 5C13.1 5 14 5.9 14 7C14 7.6 14.4 8 15 8C15.6 8 16 7.6 16 7C16 4.8 14.2 3 12 3C9.8 3 8 4.8 8 7V9H7C5.9 9 5 9.9 5 11V20C5 21.1 5.9 22 7 22H17C18.1 22 19 21.1 19 20V11C19 9.9 18.1 9 17 9ZM17 20H7V11H17V20ZM12 17C12.8 17 13.5 16.3 13.5 15.5C13.5 14.7 12.8 14 12 14C11.2 14 10.5 14.7 10.5 15.5C10.5 16.3 11.2 17 12 17Z" fill="currentColor" />
  </svg>
);

export const IconTrade: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M19 12H5C4.4 12 4 12.4 4 13C4 13.6 4.4 14 5 14H19C19.6 14 20 13.6 20 13C20 12.4 19.6 12 19 12ZM19 17H10C9.4 17 9 17.4 9 18C9 18.6 9.4 19 10 19H19C19.6 19 20 18.6 20 18C20 17.4 19.6 17 19 17ZM14 7H5C4.4 7 4 7.4 4 8C4 8.6 4.4 9 5 9H14C14.6 9 15 8.6 15 8C15 7.4 14.6 7 14 7Z" fill="currentColor" />
    <path d="M19.7 3.3L15.7 7.3C15.3 7.7 15.3 8.3 15.7 8.7C15.9 8.9 16.2 9 16.4 9C16.6 9 16.9 8.9 17.1 8.7L19.7 6.1L22.3 8.7C22.5 8.9 22.8 9 23 9C23.2 9 23.5 8.9 23.7 8.7C24.1 8.3 24.1 7.7 23.7 7.3L19.7 3.3Z" fill="currentColor" />
    <path d="M4.3 20.7L8.3 16.7C8.7 16.3 8.7 15.7 8.3 15.3C7.9 14.9 7.3 14.9 6.9 15.3L4.3 17.9L1.7 15.3C1.3 14.9 0.7 14.9 0.3 15.3C-0.1 15.7 -0.1 16.3 0.3 16.7L4.3 20.7Z" fill="currentColor" />
  </svg>
);

export const IconAuction: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M21.7 12.3L11.7 2.3C11.3 1.9 10.7 1.9 10.3 2.3L6.3 6.3C5.9 6.7 5.9 7.3 6.3 7.7L16.3 17.7C16.5 17.9 16.8 18 17 18C17.2 18 17.5 17.9 17.7 17.7L21.7 13.7C22.1 13.3 22.1 12.7 21.7 12.3ZM17 15.6L8.4 7L10.3 5.1L18.9 13.7L17 15.6ZM5.4 15C5 14.6 4.4 14.6 4 15L2.3 16.7C1.9 17.1 1.9 17.7 2.3 18.1L5.9 21.7C6.1 21.9 6.3 22 6.6 22C6.9 22 7.1 21.9 7.3 21.7L9 20C9.4 19.6 9.4 19 9 18.6L5.4 15ZM6.6 19.6L4.4 17.4L5 16.8L7.2 19L6.6 19.6Z" fill="currentColor" />
    <path d="M21 20H11C10.4 20 10 20.4 10 21C10 21.6 10.4 22 11 22H21C21.6 22 22 21.6 22 21C22 20.4 21.6 20 21 20Z" fill="currentColor" />
  </svg>
);

export const IconTimer: React.FC<IconProps> = ({ size = 16, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M15 1H9C8.4 1 8 1.4 8 2C8 2.6 8.4 3 9 3H15C15.6 3 16 2.6 16 2C16 1.4 15.6 1 15 1Z" fill="currentColor" />
    <path d="M19.8 4.2C19.4 3.8 18.8 3.8 18.4 4.2L17.1 5.5C15.7 4.3 13.9 3.6 12 3.6C7.4 3.6 3.6 7.4 3.6 12C3.6 16.6 7.4 20.4 12 20.4C16.6 20.4 20.4 16.6 20.4 12C20.4 9.6 19.4 7.4 17.8 5.8L19.8 3.8C20.2 3.4 20.2 2.8 19.8 4.2ZM12 18.4C8.5 18.4 5.6 15.5 5.6 12C5.6 8.5 8.5 5.6 12 5.6C15.5 5.6 18.4 8.5 18.4 12C18.4 15.5 15.5 18.4 12 18.4Z" fill="currentColor" />
    <path d="M12 7.6C11.4 7.6 11 8 11 8.6V12C11 12.6 11.4 13 12 13H15C15.6 13 16 12.6 16 12C16 11.4 15.6 11 15 11H13V8.6C13 8 12.6 7.6 12 7.6Z" fill="currentColor" />
  </svg>
);

export const IconPlayer: React.FC<IconProps> = ({ size = 16, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 12C14.2 12 16 10.2 16 8C16 5.8 14.2 4 12 4C9.8 4 8 5.8 8 8C8 10.2 9.8 12 12 12ZM12 6C13.1 6 14 6.9 14 8C14 9.1 13.1 10 12 10C10.9 10 10 9.1 10 8C10 6.9 10.9 6 12 6Z" fill="currentColor" />
    <path d="M18.4 15.6C16.6 14.1 14.4 13.4 12 13.4C9.6 13.4 7.4 14.2 5.6 15.6C4.4 16.6 3.7 18.2 3.7 19.9C3.7 20.5 4.1 21 4.7 21H19.3C19.9 21 20.3 20.5 20.3 19.9C20.3 18.1 19.6 16.6 18.4 15.6ZM5.8 19C6.2 18.1 6.8 17.3 7.7 16.7C8.9 15.8 10.4 15.4 12 15.4C13.6 15.4 15.1 15.8 16.3 16.7C17.2 17.4 17.8 18.2 18.2 19H5.8Z" fill="currentColor" />
  </svg>
);

export const IconBankrupt: React.FC<IconProps> = ({ size = 16, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2ZM12 20C7.6 20 4 16.4 4 12C4 7.6 7.6 4 12 4C16.4 4 20 7.6 20 12C20 16.4 16.4 20 12 20Z" fill="currentColor" />
    <path d="M15.7 8.3C15.3 7.9 14.7 7.9 14.3 8.3L12 10.6L9.7 8.3C9.3 7.9 8.7 7.9 8.3 8.3C7.9 8.7 7.9 9.3 8.3 9.7L10.6 12L8.3 14.3C7.9 14.7 7.9 15.3 8.3 15.7C8.5 15.9 8.8 16 9 16C9.2 16 9.5 15.9 9.7 15.7L12 13.4L14.3 15.7C14.5 15.9 14.8 16 15 16C15.2 16 15.5 15.9 15.7 15.7C16.1 15.3 16.1 14.7 15.7 14.3L13.4 12L15.7 9.7C16.1 9.3 16.1 8.7 15.7 8.3Z" fill="currentColor" />
  </svg>
);

export const IconTrophy: React.FC<IconProps> = ({ size = 16, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M19 2H5C4.4 2 4 2.4 4 3V6C4 8.2 5.5 10.1 7.7 10.4C8.4 11.8 9.7 12.8 11 13V15H9C8.4 15 8 15.4 8 16V19H7C6.4 19 6 19.4 6 20C6 20.6 6.4 21 7 21H17C17.6 21 18 20.6 18 20C18 19.4 17.6 19 17 19H16V16C16 15.4 15.6 15 15 15H13V13C14.3 12.8 15.6 11.8 16.3 10.4C18.5 10.1 20 8.2 20 6V3C20 2.4 19.6 2 19 2ZM6 6V4H7V8.9C6.4 8.4 6 7.3 6 6ZM14 17V19H10V17H14ZM12 11C10.3 11 9 8.8 9 6V4H15V6C15 8.8 13.7 11 12 11ZM18 6C18 7.3 17.6 8.4 17 8.9V4H18V6Z" fill="currentColor" />
  </svg>
);

// Board development markers — deliberately distinct silhouettes: a small
// green cottage vs. a tall red multi-storey hotel with lit windows.
export const IconHouse: React.FC<IconProps> = ({ size = 12, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect x="4.5" y="10.5" width="15" height="10.5" fill="#22c55e" stroke="#0a3d1c" strokeWidth="1.1" strokeLinejoin="round" />
    <path d="M12 2.5 22 11.5H2z" fill="#16a34a" stroke="#0a3d1c" strokeWidth="1.1" strokeLinejoin="round" />
    <rect x="10" y="14.5" width="4" height="6.5" fill="#0a3d1c" />
  </svg>
);

export const IconHotel: React.FC<IconProps> = ({ size = 14, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect x="5" y="3.5" width="14" height="17.5" fill="#ef4444" stroke="#7a1414" strokeWidth="1.1" strokeLinejoin="round" />
    <g fill="#fde3e3">
      <rect x="7.4" y="6" width="2.3" height="2.3" />
      <rect x="10.85" y="6" width="2.3" height="2.3" />
      <rect x="14.3" y="6" width="2.3" height="2.3" />
      <rect x="7.4" y="9.7" width="2.3" height="2.3" />
      <rect x="10.85" y="9.7" width="2.3" height="2.3" />
      <rect x="14.3" y="9.7" width="2.3" height="2.3" />
      <rect x="7.4" y="13.4" width="2.3" height="2.3" />
      <rect x="14.3" y="13.4" width="2.3" height="2.3" />
    </g>
    <rect x="10.6" y="16.5" width="2.8" height="4.5" fill="#7a1414" />
  </svg>
);

export const IconWarning: React.FC<IconProps> = ({ size = 16, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2ZM12 20C7.6 20 4 16.4 4 12C4 7.6 7.6 4 12 4C16.4 4 20 7.6 20 12C20 16.4 16.4 20 12 20ZM13 7H11V13H13V7ZM13 15H11V17H13V15Z" fill="currentColor" />
  </svg>
);
