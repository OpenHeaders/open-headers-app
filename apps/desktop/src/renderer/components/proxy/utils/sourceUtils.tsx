import { ApiOutlined, CodeSandboxOutlined, FileTextOutlined, GlobalOutlined } from '@ant-design/icons';
import type { Source } from '@/types/source';

export const getSourceIcon = (source: Pick<Source, 'sourceType'>) => {
  switch (source.sourceType) {
    case 'http':
      return <GlobalOutlined style={{ marginRight: 4 }} />;
    case 'file':
      return <FileTextOutlined style={{ marginRight: 4 }} />;
    case 'env':
      return <CodeSandboxOutlined style={{ marginRight: 4 }} />;
    default:
      return <ApiOutlined style={{ marginRight: 4 }} />;
  }
};

export const formatSourceDisplay = (source: Pick<Source, 'sourceId' | 'sourceType' | 'sourceTag' | 'sourcePath'>) => {
  const tag = source.sourceTag || '';
  const path = source.sourcePath || '';

  let display = '';

  if (tag) {
    display = `[${tag}] `;
  }

  if (path) {
    const displayPath = source.sourceType === 'env' && !path.startsWith('$') ? `$${path}` : path;
    display += displayPath;
  } else {
    display += `Source #${source.sourceId}`;
  }

  return display;
};

export const getSourceName = (sourceId: string, sources: Source[]) => {
  const source = sources.find((s) => s.sourceId === sourceId);
  return source ? source.sourceTag || source.sourcePath : 'Unknown Source';
};
