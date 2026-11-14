import titleWordmark from './assets/title-wordmark.png';

/**
 * The wordmark is authored as a small, transparent pixel raster so its
 * hand-built letter geometry stays crisp over the live gameplay art.
 */
export function TitleWordmark() {
  return (
    <h1 className="kr-wordmark kr-wordmark--raster">
      <span className="kr-wordmark__accessible">KICK RETURN</span>
      <img
        className="kr-wordmark__image"
        src={titleWordmark}
        alt=""
        aria-hidden="true"
        width="512"
        height="192"
        draggable="false"
      />
    </h1>
  );
}
