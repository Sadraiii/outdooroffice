import { useApp } from '../state';
import { Icon } from './Icon';

export function InstagramStrip() {
  const { instagram } = useApp();
  if (!instagram || !instagram.posts?.length) return null;
  const profile = `https://www.instagram.com/${instagram.username}/`;
  return (
    <section className="ig" aria-label="Fra Instagram">
      <div className="ig-head">
        <h2 className="h3">Fra Instagram</h2>
        <a href={profile} target="_blank" rel="noopener noreferrer"><Icon name="insta" />@{instagram.username}</a>
      </div>
      <div className="ig-row">
        {instagram.posts.slice(0, 9).map((p) => (
          <a key={p.id} href={p.permalink} target="_blank" rel="noopener noreferrer" aria-label="Åbn opslaget på Instagram">
            <img src={p.image} alt="" loading="lazy" />
          </a>
        ))}
      </div>
    </section>
  );
}
