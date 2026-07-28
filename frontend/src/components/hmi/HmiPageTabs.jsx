import { Box, Tab, Tabs, Typography } from '@mui/material';
import { HMI_PAGES } from '../../data/tataSteelEquipment';

export default function HmiPageTabs({ activePage, onPageChange }) {
  return (
    <Box>
      <Tabs
        value={activePage}
        onChange={(_, v) => onPageChange(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}
      >
        {HMI_PAGES.map((p) => (
          <Tab key={p.id} value={p.id} label={p.label} sx={{ textTransform: 'none', fontWeight: 600 }} />
        ))}
      </Tabs>
      <Typography variant="caption" color="text.secondary">
        {HMI_PAGES.find((p) => p.id === activePage)?.description}
      </Typography>
    </Box>
  );
}
