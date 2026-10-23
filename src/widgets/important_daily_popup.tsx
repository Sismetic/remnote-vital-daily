import { renderWidget } from '@remnote/plugin-sdk';
import React from 'react';
import { DailyPracticeWidget } from './vital_daily';

renderWidget(() => <DailyPracticeWidget priority="important" startStudying />);
