export const getInitials = (name: string) => {
  const parts = name.split(' ');
  return (parts[0]?.charAt(0) || '') + (parts[1]?.charAt(0) || '');
};

export const FILE_MESSAGE_PATTERN = /^\[ARQUIVO:\s*(.+?)\|(.+?)\]$/;
