/** Shared responsive layout sx — use for consistent phone / tablet / laptop layouts */

export const pageTitleSx = {
  fontWeight: 700,
  fontSize: { xs: '1.25rem', sm: '1.5rem' },
};

export const pageHeaderRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: { xs: 'stretch', sm: 'center' },
  flexDirection: { xs: 'column', sm: 'row' },
  flexWrap: 'wrap',
  gap: 2,
  mb: { xs: 2, md: 3 },
};

export const responsiveSelect = {
  minWidth: { xs: '100%', sm: 220, md: 280 },
  width: { xs: '100%', sm: 'auto' },
};

export const responsiveTableWrap = {
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
  maxWidth: '100%',
};

export const contentMaxWidth = {
  width: '100%',
  maxWidth: { lg: 1600, xl: 1920 },
  mx: 'auto',
};
