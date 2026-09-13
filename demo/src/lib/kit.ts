import { createKit } from '@gongxtao/extension-kit';

/** demo 唯一 kit 实例——ns=demokit（多产品共存：与 exkit/真实产品互不串台） */
export const kit = createKit({ namespace: 'demokit' });
