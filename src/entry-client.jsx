import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import App from './App.jsx';

hydrateRoot(
	document.getElementById('root'),
	<StrictMode>
		<App initialPostData={window.__INITIAL_POST_DATA__} cached={window.__CACHED__} />
	</StrictMode>
);
