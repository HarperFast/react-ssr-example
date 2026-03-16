import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';

export function render({ initialPostData, cached }) {
	const html = renderToString(
		<StrictMode>
			<App initialPostData={initialPostData} cached={cached} />
		</StrictMode>
	);
	return { html };
}
