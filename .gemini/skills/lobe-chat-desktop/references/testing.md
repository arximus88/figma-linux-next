# Testing LobeChat Desktop Controllers

Controllers should be independently testable using a mocking layer for Electron APIs.

```typescript
import { FileSystemController } from '../FileSystemController';
import { dialog } from 'electron';

jest.mock('electron', () => ({
  dialog: {
    showOpenDialog: jest.fn(),
  },
}));

describe('FileSystemController', () => {
  let controller: FileSystemController;

  beforeEach(() => {
    controller = new FileSystemController();
  });

  it('should return file paths when directory is selected', async () => {
    (dialog.showOpenDialog as jest.Mock).mockResolvedValue({
      filePaths: ['/test/path'],
    });

    const result = await controller.selectDirectory({});
    expect(result).toEqual(['/test/path']);
  });
});
```
