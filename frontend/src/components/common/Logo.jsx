import { Box } from '@mui/material';

export default function Logo({ height = 40, sx = {}, ...props }) {
  return (
    <Box
      component="img"
      src="/swarm-logo.png"
      alt="SWARM by nanoFarm"
      sx={{ height, width: 'auto', objectFit: 'contain', display: 'block', ...sx }}
      {...props}
    />
  );
}
