class CommentView extends HTMLElement {
  constructor(commentViewData) {
    super();

    this.comment = commentViewData.comment;
    this.playbackEngine = commentViewData.playbackEngine;
    this.isDescriptionComment = commentViewData.isDescriptionComment;
    this.commentNumber = commentViewData.commentNumber;
    this.totalNumberOfComments = commentViewData.totalNumberOfComments;
    
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(this.getTemplate());
  }

  getTemplate() {
    const template = document.createElement('template');
    template.innerHTML = `
      <style>
        :host {
          display: block;
          border: 1px gray solid;
          padding: 3px 12px;
          background-color: rgb(51, 51, 51);
        }
        :host(.activeGroup) {
          background-color: rgb(60, 60, 60);
        }
        :host(.activeComment) {
          background-color: rgb(59,76,98);
        }
        :host(.nonRelevantSearchResult) {
          display: none;
        }

        #editCommentButton {
          opacity: 80%;
          visibility: hidden;
          content: "";
          background-image: url("data:image/svg+xml,<svg viewBox='0 0 16 16' class='bi bi-pencil-square test' fill='lightgray' xmlns='http://www.w3.org/2000/svg'><path fill-rule='evenodd' d='M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456l-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z'/><path fill-rule='evenodd' d='M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H9a.5.5 0 0 0 0-1H2.5A1.5 1.5 0 0 0 1 2.5v11z' clip-rule='evenodd'/></svg>");
          background-repeat: no-repeat;
          background-color: transparent;
          height: 1.6em;
          width: 1.6em;
          border: none;
          cursor: pointer;
        }
        #editCommentButton:hover {
          opacity: 100%;
        }
        :host(.activeComment) #editCommentButton:not(.inactive) {
          visibility: initial;
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

        .commentTopBar {
          border-bottom: 1px solid rgb(83, 84, 86);
          margin-bottom: 8px;
          overflow-y: auto;
        }

        .commentCount {
          font-size: .95em;
          padding-bottom: 3px;
          display: inline;
          color: rgb(127, 138, 148);
        }

        .commentText {
          padding: 2px 5px 12px 5px;
        }

        .commentTitle {
          padding: 5px;
          font-size: 1.3em;
        }

        .commentAvatar {
          display: inline;
        }

        .titleBar {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.35em;
          padding: 8px 0px;
        }

        .commentBar {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .commentDevelopersDiv {
          display: flex;
          align-items: center;
        }

        .commentCountContainer {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          margin-bottom: 5px;
        }

        .descriptionCommentTopBar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          justify-content: space-between;
        }

        .descriptionCommentTopBar .titleBar {
          flex: 1;
          text-align: center;
        }

        .descriptionCommentTopBar .commentCountContainer {
          margin-left: auto;
        }

        .searchHighlight {
          background-color: #517EB0;
        }
      </style>
      <div>
        <div class="commentTopBar"></div>
        <div class="commentTitle"></div>
        <div class="commentText"></div>
        <div class="media"></div>
        <div class="questionAndAnswerContainer"></div>
        <div class="tagContainer"></div>
        <div id="aiInput"></div>
        <button id="editCommentButton" class="inactive" title="Edit this comment"></button>
      </div>`;

    return template.content.cloneNode(true);
  }

  connectedCallback() {
    const commentView = this.shadowRoot.host;
    commentView.addEventListener('click', this.commentClicked);
    document.addEventListener('keydown', this.ttsKeyboardPress);

    //if this is an editable playback
    if(this.playbackEngine.playbackData.isEditable) {
      //add an edit button
      const editCommentButton = this.shadowRoot.querySelector('#editCommentButton');
      editCommentButton.classList.remove('inactive');
      editCommentButton.addEventListener('click', this.beginEditComment);
    }

    //top of comment view
    this.buildCommentViewTop();

    //comment title
    if(this.comment.commentTitle) {
      const commentTitle = this.shadowRoot.querySelector('.commentTitle');
      commentTitle.innerHTML = this.comment.commentTitle;
    }
    //comment text
    const commentText = this.shadowRoot.querySelector('.commentText');
    let formattedCommentText = this.comment.commentText;
    //if the text format is markdown, convert it to html
    if(this.comment.textFormat && this.comment.textFormat === 'markdown') {
      const md = markdownit();
      formattedCommentText = md.render(this.comment.commentText);
    }
    commentText.innerHTML = formattedCommentText;
    //media
    const media = this.shadowRoot.querySelector('.media');
    //videos
    if(this.comment.videoURLs.length > 0) {
      for(let i = 0;i < this.comment.videoURLs.length;i++) {
        const commentVideo = document.createElement('video');
        commentVideo.setAttribute('controls', '');
        commentVideo.setAttribute('src', this.comment.videoURLs[i]);
        commentVideo.classList.add('commentVideo');
        media.appendChild(commentVideo);
      }
    }
    //audios
    if(this.comment.audioURLs.length > 0) {
      for(let i = 0;i < this.comment.audioURLs.length;i++) {
        const commentAudio = document.createElement('audio');
        commentAudio.setAttribute('controls', '');
        commentAudio.setAttribute('src', this.comment.audioURLs[i]);
        commentAudio.classList.add('commentAudio');
        media.appendChild(commentAudio);
      }
    }
    //images
    if(this.comment.imageURLs.length > 0) {
      media.appendChild(new ImageGallery(this.comment.imageURLs,true));
    }
    
    //if there are any comment tags
    if(this.comment.commentTags.length > 0) {
      //create a tag view to display the tags
      const tagContainer = this.shadowRoot.querySelector('.tagContainer');
      const tagView = new TagView(this.comment);
      tagContainer.appendChild(tagView);
    }

    //if there is a q&a
    if(this.comment.questionCommentData && this.comment.questionCommentData.question) {
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
  }

  disconnectedCallback() {
    const commentView = this.shadowRoot.host;
    commentView.removeEventListener('click', this.commentClicked);
    document.removeEventListener('keydown', this.ttsKeyboardPress);
  }

  makeCommentViewActive() {
    //make this comment view have the active class
    this.shadowRoot.host.classList.add('activeComment');

    //make the aiInput visible
    const aiInput = this.shadowRoot.querySelector('#aiInput');
    aiInput.style.display = 'block';

    //get the rectangle around the active comment that is displayed
    const commentRectangle = this.shadowRoot.host.getBoundingClientRect();

    //if the comment's top/bottom edge is  off of the screen (+/- 150px)
    if ((commentRectangle.bottom - 150 < 0) || (commentRectangle.top > window.innerHeight - 150) ) {
      //scroll to the active comment
      this.shadowRoot.host.scrollIntoView({behavior: 'auto', block: 'center', inline: 'start'})
    }
  }
  makeCommentViewInactive() {
    this.shadowRoot.host.classList.remove('activeComment');

    //make the aiInput invisible
    const aiInput = this.shadowRoot.querySelector('#aiInput');
    aiInput.style.display = 'none';
    
  }

  makePartOfActiveGroup() {
    this.shadowRoot.host.classList.add('activeGroup');
  }
  makePartOfInactiveGroup() {
    this.shadowRoot.host.classList.remove('activeGroup');
  }

  updateForTitleChange(newTitle) {
    const titleBar = this.shadowRoot.querySelector('.titleBar');
    titleBar.innerHTML = newTitle;
  }

  beginEditComment = (clickEvent) => {
    //stop the click associated with the button to prevent treating as a comment click
    clickEvent.stopPropagation();
    clickEvent.preventDefault();

    const event = new CustomEvent('begin-edit-comment', { 
      detail: {
        comment: this.comment
      },
      bubbles: true, 
      composed: true 
    });
    this.dispatchEvent(event);
  }

  commentClicked = event => {
    this.sendActiveCommentEvent();
  }

  ttsKeyboardPress = event => {
    //if p was pressed and this is the active comment
    if (event.key === 'p' && this.comment.id === this.playbackEngine.activeComment.id) {
      //simulate a button click
      const ttsControl = this.shadowRoot.querySelector('st-text-to-speech-control');
      ttsControl.handleButtonClick();
    }
  }

  buildCommentViewTop() {
    const commentTopBar = this.shadowRoot.querySelector('.commentTopBar');

    const commentCountContainer = document.createElement('div');
    commentCountContainer.classList.add('commentCountContainer');

    const commentCount = document.createElement('div');
    commentCount.classList.add('commentCount');
    commentCount.innerHTML = `${this.commentNumber + 1}/${this.totalNumberOfComments}`; 
    commentCountContainer.appendChild(commentCount);
    
    let ttsControl;
    //if this comment has a tts file path
    if(this.comment.ttsFilePath) {
      //create a tts control with the file path
      ttsControl = new TextToSpeechControl(this.comment.ttsFilePath, null, this.playbackEngine.editorProperties.ttsSpeed, true);
      commentCountContainer.appendChild(ttsControl);
    } else if(this.playbackEngine.playbackData.aiEnabled) { //no tts file path in this comment
      //create a tts that will convert the text to speech
      ttsControl = new TextToSpeechControl(null, this.comment.commentTitle + " " + this.comment.commentText, this.playbackEngine.editorProperties.ttsSpeed, true);
      commentCountContainer.appendChild(ttsControl);
    } //else- no tts control

    if (this.isDescriptionComment) {
      const titleBarDiv = document.createElement('div');
      titleBarDiv.classList.add('titleBar');
      titleBarDiv.innerHTML = this.playbackEngine.playbackData.playbackTitle;

      const descriptionCommentTopBar = document.createElement('div');
      descriptionCommentTopBar.classList.add('descriptionCommentTopBar');
      descriptionCommentTopBar.appendChild(titleBarDiv);
      descriptionCommentTopBar.appendChild(commentCountContainer);

      commentTopBar.appendChild(descriptionCommentTopBar);
    } else {
      const commentBar = document.createElement('div');
      commentBar.classList.add('commentBar');
  
      const devGroup = document.createElement('div');
      devGroup.classList.add('commentDevelopersDiv');
      devGroup.appendChild(new DevGroupAvatar({
        developerGroupId: this.comment.developerGroupId, 
        developers: this.playbackEngine.playbackData.developers, 
        developerGroups: this.playbackEngine.playbackData.developerGroups
      }));

      commentBar.appendChild(devGroup);
      commentBar.appendChild(commentCountContainer);
      commentTopBar.appendChild(commentBar);
    }
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
        const commentText = this.shadowRoot.querySelector('.commentText');
        //surround each instance of the search text with a tag
        let replacedString = this.playbackEngine.surroundHTMLTextWithTag(commentText.innerHTML, searchResult.searchText, '<span class="searchHighlight">', '</span>');
        commentText.innerHTML = replacedString;

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
    let formattedCommentText = this.comment.commentText;
    //if the text format is markdown, convert it to html
    if(this.comment.textFormat && this.comment.textFormat === 'markdown') {
      const md = markdownit();
      formattedCommentText = md.render(this.comment.commentText);
    }
    const commentText = this.shadowRoot.querySelector('.commentText');
    commentText.innerHTML = formattedCommentText;
    
    const commentTitle = this.shadowRoot.querySelector('.commentTitle');
    commentTitle.innerHTML = this.comment.commentTitle;

    //remove the search highlight
    const questionAnswerView = this.shadowRoot.querySelector('st-question-answer-view');
    if(questionAnswerView) {
      questionAnswerView.classList.remove('questionSearchHighlight');
    }
  }

  sendActiveCommentEvent() {
    const event = new CustomEvent('active-comment', { 
      detail: {activeCommentId: this.comment.id}, 
      bubbles: true, 
      composed: true 
    });
    this.dispatchEvent(event);
  }
}

window.customElements.define('st-comment-view', CommentView);