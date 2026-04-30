import { InjectionToken } from '@angular/core';

/** Base URL of the Nest API (no trailing slash). */
export const API_URL = new InjectionToken<string>('API_URL');
