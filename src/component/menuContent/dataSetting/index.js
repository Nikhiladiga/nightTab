import { message } from '../../message';

import { data } from '../../data';
import { menu } from '../../menu';
import { sync } from '../../sync';
import { auth } from '../../sync/auth';
import { APP_NAME, GOOGLE_CLIENT_ID, SYNC_WORKER_URL } from '../../../constant';

import * as form from '../../form';

import { Button } from '../../button';
import { Alert } from '../../alert';
import { DropFile } from '../../dropFile';
import { Link } from '../../link';

import { Control_helperText } from '../../control/helperText';
import { Control_inputButton } from '../../control/inputButton';

import { node } from '../../../utility/node';

const dataSetting = {};

dataSetting.control = {
  sync: {},
  restore: {},
  backup: {},
  clear: {}
};

dataSetting.sync = (parent) => {

  const control = dataSetting.control.sync;

  if (typeof chrome === 'undefined' || !chrome.identity || !GOOGLE_CLIENT_ID || !SYNC_WORKER_URL) {
    control.helper = new Control_helperText({
      text: [message.get('menuContentDataSyncNotConfigured')]
    });
    parent.appendChild(node('div', [control.helper.wrap()]));
    return;
  }

  const statusKey = {
    'signed-out': 'menuContentDataSyncStatusSignedOut',
    'syncing': 'menuContentDataSyncStatusSyncing',
    'synced': 'menuContentDataSyncStatusSynced',
    'offline': 'menuContentDataSyncStatusOffline',
    'error': 'menuContentDataSyncStatusError',
    'blocked': 'menuContentDataSyncStatusBlocked',
    'reauth': 'menuContentDataSyncStatusReauth'
  };

  let signInError = '';

  control.account = node('p|class:small');
  control.status = node('p|class:small');

  control.signIn = new Button({
    text: message.get('menuContentDataSyncSignIn'),
    style: ['line'],
    func: async () => {
      signInError = '';
      try {
        await sync.signIn();
      } catch (error) {
        signInError = error.message;
      }
      control.render();
    }
  });

  control.signOut = new Button({
    text: message.get('menuContentDataSyncSignOut'),
    style: ['line'],
    func: async () => {
      signInError = '';
      await sync.signOut();
      control.render();
    }
  });

  control.now = new Button({
    text: message.get('menuContentDataSyncNow'),
    style: ['line'],
    func: () => {
      sync.run();
    }
  });

  control.restoreBackup = new Button({
    text: message.get('menuContentDataSyncRestoreBackup'),
    style: ['line'],
    func: () => {
      const backup = data.get(APP_NAME + 'Backup');
      if (backup !== null) {
        // swap, so a second click undoes the restore
        const current = data.get(APP_NAME);
        if (current !== null) {
          data.set(APP_NAME + 'Backup', current);
        }
        data.set(APP_NAME, backup);
        sync.markChanged();
        data.reload.render();
      }
    }
  });

  control.restoreHelper = new Control_helperText({
    text: [message.get('menuContentDataSyncRestoreBackupHelper')]
  });

  control.render = () => {
    const signedIn = auth.isSignedIn();
    let status = message.get(statusKey[sync.status] || statusKey['signed-out']);
    if (signedIn && sync.status === 'synced' && sync.lastSync) {
      status = status + ' ' + new Date(sync.lastSync).toLocaleString();
    }
    control.account.textContent = signedIn ? (message.get('menuContentDataSyncSignedIn') + ' ' + (auth.email() || '')).trim() : '';
    control.status.textContent = signInError || status;
    control.signIn.button.hidden = signedIn;
    control.signOut.button.hidden = !signedIn;
    control.now.button.hidden = !signedIn;
    if (data.get(APP_NAME + 'Backup') === null) {
      control.restoreBackup.disable();
    } else {
      control.restoreBackup.enable();
    }
  };

  sync.onStatus(control.render);

  control.render();

  parent.appendChild(
    node('div', [
      form.wrap({
        children: [
          control.account,
          control.status
        ]
      }),
      form.wrap({
        children: [
          form.inline({
            gap: 'small',
            equalGap: true,
            wrap: true,
            children: [
              control.signIn.wrap(),
              control.signOut.wrap(),
              control.now.wrap()
            ]
          })
        ]
      }),
      form.wrap({
        children: [
          control.restoreBackup.wrap()
        ]
      }),
      control.restoreHelper.wrap()
    ])
  );

};

dataSetting.restore = (parent) => {

  dataSetting.control.restore.restoreElement = new Control_inputButton({
    id: 'restore-data',
    type: 'file',
    buttonHideInput: true,
    labelText: message.get('menuContentDataRestoreFile'),
    inputButtonStyle: ['line'],
    action: () => {
      data.import.file({
        fileList: dataSetting.control.restore.restoreElement.input.files,
        feedback: dataSetting.control.restore.feedback,
        input: dataSetting.control.restore.restoreElement
      });
    }
  });

  dataSetting.control.restore.paste = new Button({
    text: message.get('menuContentDataRestoreClipboard'),
    style: ['line'],
    func: () => {
      data.import.paste({
        feedback: dataSetting.control.restore.feedback,
      });
    }
  });

  dataSetting.control.restore.restoreHelper = new Control_helperText({
    text: [message.get('menuContentDataRestoreHelperPara1')]
  });

  dataSetting.control.restore.feedback = form.feedback();

  data.feedback.clear.render(dataSetting.control.restore.feedback);

  data.feedback.empty.render(dataSetting.control.restore.feedback);

  dataSetting.control.restore.drop = new DropFile({
    heading: message.get('menuContentDataRestoreDrop'),
    dropAaction: () => {
      data.import.drop({
        fileList: dataSetting.control.restore.drop.files,
        feedback: dataSetting.control.restore.feedback,
      });
    },
    children: [
      dataSetting.control.restore.restoreElement.button,
      dataSetting.control.restore.paste.button
    ]
  });

  parent.appendChild(
    node('div', [
      dataSetting.control.restore.drop.wrap(),
      form.wrap({
        children: [
          dataSetting.control.restore.feedback
        ]
      }),
      dataSetting.control.restore.restoreHelper.wrap()
    ])
  );

};

dataSetting.backup = (parent) => {

  dataSetting.control.backup.export = new Button({
    text: message.get('menuContentDataBackupFile'),
    style: ['line'],
    func: () => {
      data.export();
    }
  });

  dataSetting.control.backup.copy = new Button({
    text: message.get('menuContentDataBackupClipboard'),
    style: ['line'],
    func: () => {
      navigator.clipboard.writeText(JSON.stringify(data.load()));
    }
  });

  dataSetting.control.backup.exportHelper = new Control_helperText({
    text: [
      message.get('menuContentDataBackupHelperPara1'),
      message.get('menuContentDataBackupHelperPara2')
    ]
  });

  parent.appendChild(
    node('div', [
      form.wrap({
        children: [
          form.inline({
            gap: 'small',
            equalGap: true,
            wrap: true,
            children: [
              dataSetting.control.backup.export.wrap(),
              dataSetting.control.backup.copy.wrap()
            ]
          })
        ]
      }),
      dataSetting.control.backup.exportHelper.wrap()
    ])
  );

};

dataSetting.clear = (parent) => {

  dataSetting.control.clear.all = new Button({
    text: message.get('menuContentDataClearAll'),
    style: ['line'],
    func: () => {
      menu.close();
      data.clear.all.render();
    }
  });

  dataSetting.control.clear.partial = new Button({
    text: message.get('menuContentDataClearPartial'),
    style: ['line'],
    func: () => {
      menu.close();
      data.clear.partial.render();
    }
  });

  dataSetting.control.clear.link = new Link({
    text: message.get('menuContentDataClearAlertLink'),
    href: '#menu-content-item-backup'
  });

  dataSetting.control.clear.alert = new Alert({
    iconName: 'warning',
    children: [
      node(`p:${message.get('menuContentDataClearAlertPara') || 'Text'}|class:small`),
      node('p|class:small', dataSetting.control.clear.link.link())
    ]
  });

  dataSetting.control.clear.helper = new Control_helperText({
    text: [
      message.get('menuContentDataClearHelperPara1'),
      message.get('menuContentDataClearHelperPara2')
    ]
  });

  parent.appendChild(
    node('div', [
      form.wrap({
        children: [
          form.inline({
            gap: 'small',
            equalGap: true,
            wrap: true,
            children: [
              dataSetting.control.clear.all.wrap(),
              dataSetting.control.clear.partial.wrap()
            ]
          })
        ]
      }),
      dataSetting.control.clear.alert.wrap(),
      dataSetting.control.clear.helper.wrap()
    ])
  );

};

export { dataSetting };
