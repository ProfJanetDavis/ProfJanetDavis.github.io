class BlogComponent extends HTMLElement {
  constructor(playbackEngine, comment) {
    super();
    this.playbackEngine = playbackEngine;
    this.comment = comment;

    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(this.getTemplate());
  }

  getTemplate() {
    const template = document.createElement('template');
    template.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 10px;
        }

        :host(.activeComment) {
          background-color: rgb(40, 40, 40);
        }

        :host(.descriptionComment) {
          font-size: 1.2em;
        }

        a {
          color: lightblue;
        }
        a:visited {
          color: lightblue;
        }
        a:hover {
          opacity: 80%;
        }
        
        .blogModeVideo, .blogModeAudio, .blogModePicture {
          width: 75%;
        }

        .commentFileName {
          color: gray;
        }

        .mediaDiv {
          display: flex;
          justify-content: center;
          padding: 10px 0px 5px 0px;
        }

        .commentTitle {
          padding: 8px;
          margin-left: -8px;
          font-size: 1.3em;
        }
        .searchHighlight {
          background-color: #517EB0;
        }

        #aiInput {
          margin-top: 5px;
          padding-top: 5px;
          border-top: 1px solid rgb(83, 84, 86);
        }
      </style>

      <div class="tts-container"></div>
      <div class="commentTitle"></div>
      <div class="blogCommentText"></div>
      <div class="commentVideos"></div>
      <div class="commentAudios"></div>
      <div class="codeEditor"></div>
      <div class="commentImages"></div>
      <div class="tagContainer"></div>
      <div class="questionAndAnswerContainer"></div>
      <div id="aiInput"></div>`;

    return template.content.cloneNode(true);
  }

  connectedCallback() {
    //if there is a comment title add it
    if(this.comment.commentTitle) {
      const commentTitle = this.shadowRoot.querySelector('.commentTitle');
      commentTitle.innerHTML = this.comment.commentTitle;
    }

    //add the comment text
    const blogCommentText = this.shadowRoot.querySelector('.blogCommentText');
    let commentText = this.comment.commentText;
    if(this.comment.textFormat && this.comment.textFormat === "markdown") {
      const md = markdownit();
      commentText = md.render(this.comment.commentText);
    }
    blogCommentText.innerHTML = commentText;
    
    //text to speech control
    const ttsContainer = this.shadowRoot.querySelector('.tts-container');
    let ttsControl;
    //if this comment has a tts file path
    if(this.comment.ttsFilePath) {
      //create a tts control with the file path
      ttsControl = new TextToSpeechControl(this.comment.ttsFilePath, null, this.playbackEngine.editorProperties.ttsSpeed);
      ttsContainer.appendChild(ttsControl);
    } else if(this.playbackEngine.playbackData.aiEnabled) { //no tts file path in this comment
      //create a tts control with the comment text
      ttsControl = new TextToSpeechControl(null, this.comment.commentTitle + " " + this.comment.commentText, this.playbackEngine.editorProperties.ttsSpeed);
      ttsContainer.appendChild(ttsControl);
    } //else- no tts control
    
    //add the media
    //videos
    const commentVideos = this.shadowRoot.querySelector('.commentVideos');
    if (this.comment.videoURLs.length > 0) {
      this.comment.videoURLs.forEach(url => {
        const video = document.createElement('video');
        video.setAttribute('controls', '');
        video.setAttribute('src', url);
        video.classList.add('blogModeVideo');

        const videoDiv = document.createElement('div');
        videoDiv.classList.add('mediaDiv');
        videoDiv.appendChild(video);
        commentVideos.appendChild(videoDiv);
      });
    }
    //audios
    const commentAudios = this.shadowRoot.querySelector('.commentAudios');
    if (this.comment.audioURLs.length > 0) {
      this.comment.audioURLs.forEach(url => {
        const audio = document.createElement('audio');
        audio.setAttribute('controls', '');
        audio.setAttribute('src', url);
        audio.classList.add('blogModeAudio');

        const audioDiv = document.createElement('div');
        audioDiv.classList.add('mediaDiv');
        audioDiv.appendChild(audio);
        commentAudios.appendChild(audioDiv);
      });
    }

    //if there is some code to display
    if (this.comment.selectedCodeBlocks[0]) {
      //create a code snippet
      const blogCodeSnippet = new BlogCodeSnippet(this.comment, this.playbackEngine);
      const codeEditor = this.shadowRoot.querySelector('.codeEditor');
      codeEditor.appendChild(blogCodeSnippet);
    }

    //images
    const commentImages = this.shadowRoot.querySelector('.commentImages');
    if (this.comment.imageURLs.length > 0) {
      const imageGallery = new ImageGallery(this.comment.imageURLs, false);
      commentImages.appendChild(imageGallery);
    }

    //if there are any comment tags
    if(this.comment.commentTags.length > 0) {
      //create a label
      const tagContainer = this.shadowRoot.querySelector('.tagContainer');
      const tagView = new TagView(this.comment);
      tagContainer.appendChild(tagView);
    }

    //if there is a q&a
    if(this.comment.questionCommentData && this.comment.questionCommentData.question) {
      //create a tag view to display the tags
      const questionAndAnswerContainer = this.shadowRoot.querySelector('.questionAndAnswerContainer');
      const qaView = new QuestionAnswerView(this.comment);
      questionAndAnswerContainer.appendChild(qaView);
    }

    //ai input
    if(!this.isDescriptionComment && this.playbackEngine.playbackData.aiEnabled) {
      //create an AI input to get suggestions
      const aiInput = this.shadowRoot.querySelector('#aiInput');
      const promptCollapsable = new Collapsable('Ask About This Code');
      const aiPromptInput = new AIPromptInput(this.playbackEngine, false);
      const aiGeneratedQ = new AIGeneratedQuestion(this.playbackEngine);
      const aiElements = document.createElement('div');
      aiElements.classList.add('aiElements');
      aiElements.appendChild(aiPromptInput);
      aiElements.appendChild(document.createElement('hr'));
      aiElements.appendChild(aiGeneratedQ);
      promptCollapsable.addContent(aiElements);
      aiInput.appendChild(promptCollapsable);
    }
    
    //add an event handler so users can click comments
    this.addEventListener('click', event => {
      //move to the comment that is clicked
      this.playbackEngine.stepToCommentById(this.comment.id);
    });
  }

  disconnectedCallback() {
  }

  updateToDisplaySearchResults(searchResult) {
    //if there is some search text
    if(searchResult.searchText.length > 0) {
      //if there is a result in the tags
      if(searchResult.inTags) {
        const tagView = this.shadowRoot.querySelector('st-tag-view');
        tagView.highlightTag(searchResult.searchText);
      }

      //if there is a result in the comment text
      if(searchResult.inCommentText) {
        const blogCommentText = this.shadowRoot.querySelector('.blogCommentText');
    
        //surround each instance of the search text with a tag
        let replacedString = this.playbackEngine.surroundHTMLTextWithTag(blogCommentText.innerHTML, searchResult.searchText, '<span class="searchHighlight">', '</span>');
        blogCommentText.innerHTML = replacedString;

        const commentTitle = this.shadowRoot.querySelector('.commentTitle');
        //surround each instance of the search text with a tag
        replacedString = this.playbackEngine.surroundHTMLTextWithTag(commentTitle.innerHTML, searchResult.searchText, '<span class="searchHighlight">', '</span>');
        commentTitle.innerHTML = replacedString;
      }

      //if there is a result in the question
      if(searchResult.inQuestion) {
        const questionAnswerView = this.shadowRoot.querySelector('st-question-answer-view');
        questionAnswerView.classList.add('questionSearchHighlight');
      }
    }
  }

  updateTTSSpeed(speed) {
    const ttsControl = this.shadowRoot.querySelector('st-text-to-speech-control');
    ttsControl.updateTTSSpeed(speed);
  }

  revealCommentsBeforeSearch() {
    const tagView = this.shadowRoot.querySelector('st-tag-view');
    if(tagView) {
      //clear out the tags
      tagView.dehighlightTags();
    }

    //set the text back to the original
    const blogCommentText = this.shadowRoot.querySelector('.blogCommentText');
    blogCommentText.innerHTML = this.comment.commentText;

    const commentTitle = this.shadowRoot.querySelector('.commentTitle');
    commentTitle.innerHTML = this.comment.commentTitle;

    const questionAnswerView = this.shadowRoot.querySelector('st-question-answer-view');
    if(questionAnswerView) {
      questionAnswerView.classList.remove('questionSearchHighlight');
    }
  }
  
  highlightSearch(searchText) {
    const blogCodeSnippet = this.shadowRoot.querySelector('st-blog-code-snippet');
    //if there is some code in this comment
    if(blogCodeSnippet) {
      //if there is something to search
      if(searchText.length > 0) {
        //highlight it in the editor
        blogCodeSnippet.highlightSearch(searchText);
      } else { //nothing to search for (empty search box)
        //if there is some code to display, rerender the blog snippet to remove any previous search results
        if(this.comment.selectedCodeBlocks[0]) {
          const codeEditor = this.shadowRoot.querySelector('.codeEditor');
          codeEditor.innerHTML = '';

          //create a code snippet
          const blogCodeSnippet = new BlogCodeSnippet(this.comment, this.playbackEngine);
          codeEditor.appendChild(blogCodeSnippet);
        }
      }
    }
  }
}

window.customElements.define('st-blog-component', BlogComponent);