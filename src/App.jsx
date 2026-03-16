import { useEffect, useState } from 'react';

function CommentInput({ addComment }) {
	const [newComment, setNewComment] = useState('');

	const handleCommentChange = (e) => {
		setNewComment(e.target.value);
	};

	const handleCommentSubmit = (e) => {
		e.preventDefault();
		if (newComment.trim()) {
			addComment(newComment);
			setNewComment('');
		}
	};

	return (
		<form onSubmit={handleCommentSubmit}>
			<input type="text" value={newComment} onChange={handleCommentChange} placeholder="Add a comment" />
			<button type="submit">Submit</button>
		</form>
	);
}

export default function Post({ initialPostData, cached }) {
	const [post, setPost] = useState(initialPostData);

	useEffect(() => {
		const ws = new WebSocket(`ws://localhost:9926/Post/${post.id}`);
		ws.onmessage = (event) => {
			const message = JSON.parse(event.data);
			setPost(message.value);
		};

		return () => {
			ws.close();
		};
	}, []);

	const addComment = (comment) => {
		const newPost = { ...post, comments: [...post.comments, comment] };

		fetch(`http://localhost:9926/Post/${post.id}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(newPost),
		})
			.then((response) => {
				if (response.ok) {
					console.log('Comment added!');
				} else {
					console.error('Error adding comment:', response.statusText);
				}
			})
			.catch((error) => {
				console.error('Error adding comment:', error);
			});
	};

	const deleteComment = (index) => {
		const newPost = { ...post, comments: post.comments.filter((_, i) => i !== index) };

		fetch(`http://localhost:9926/Post/${post.id}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(newPost),
		})
			.then((response) => {
				if (response.ok) {
					console.log('Comment deleted!');
				} else {
					console.error('Error deleting comment:', response.statusText);
				}
			})
			.catch((error) => {
				console.error('Error deleting comment:', error);
			});
	};

	return (
		<article>
			<span className={`cache-pill ${cached ? 'cached' : 'uncached'}`}>
				{cached ? 'Cached' : 'Uncached'}
			</span>
			<h1>{post.title}</h1>
			<p>{post.body}</p>
			{post.comments && post.comments.length > 0 ? (
				<ul>
					{post.comments.map((comment, index) => (
						<li key={index}>
							<span>{comment}</span>
							<button className="delete-button" onClick={() => deleteComment(index)}>
								X
							</button>
						</li>
					))}
				</ul>
			) : (
				<p>No Comments Yet!</p>
			)}
			<CommentInput addComment={addComment} />
		</article>
	);
}
