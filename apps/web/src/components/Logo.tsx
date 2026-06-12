import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
  color?: string;
}

const Logo: React.FC<LogoProps> = ({ className = '', size = 40 }) => {
  return (
    <img
      src="/logo.png"
      alt="App Logo"
      width={size}
      height={size}
      decoding="async"
      className={`rounded-full object-cover ${className}`}
      referrerPolicy="no-referrer"
    />
  );
};

export default Logo;
