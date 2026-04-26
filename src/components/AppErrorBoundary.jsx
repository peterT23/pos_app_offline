import React from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: String(error?.message || 'Ứng dụng gặp lỗi không mong muốn.'),
    };
  }

  componentDidCatch(error, info) {
    // Keep a local trail for debugging white-screen reports
    try {
      // eslint-disable-next-line no-console
      console.error('AppErrorBoundary:', error, info);
    } catch {
      // ignore
    }
  }

  render() {
    const { hasError, message } = this.state;
    if (!hasError) return this.props.children;
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5', display: 'grid', placeItems: 'center', p: 2 }}>
        <Paper sx={{ p: 3, maxWidth: 520, width: '100%' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            Có lỗi xảy ra
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {message}
          </Typography>
          <Button
            variant="contained"
            onClick={() => window.location.reload()}
            sx={{ textTransform: 'none' }}
          >
            Tải lại ứng dụng
          </Button>
        </Paper>
      </Box>
    );
  }
}
