import { renderWidget } from '@remnote/plugin-sdk';
import React from 'react';
import { VitalDailyWidget } from './vital_daily';

renderWidget(() => <VitalDailyWidget startStudying />);
